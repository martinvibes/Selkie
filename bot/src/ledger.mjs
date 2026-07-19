// Minimal Daml JSON API client. No dependencies: node's fetch + crypto only.
//
// Selkie runs the hosted-party model — the operator's participant hosts every
// user's party, so the operator can submit on their behalf (actAs). What the
// operator is *allowed* to do is fenced by the DAML choices, not by trust.

import { createHmac } from "node:crypto";

const b64url = (s) => Buffer.from(s).toString("base64url");

/** Mint a Daml ledger access token (custom-claims format, HS256). */
export function mintToken({ secret, applicationId, ledgerId, actAs, readAs = [], admin = false }) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    "https://daml.com/ledger-api": {
      ledgerId,
      applicationId,
      actAs,
      readAs: [...new Set([...actAs, ...readAs])],
      admin,
    },
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${sig}`;
}

/**
 * Sandbox auth: we sign our own tokens with a shared secret, which the ledger
 * only accepts because it was started with --allow-insecure-tokens. Every
 * request carries exactly the rights it needs, because we mint them per call.
 */
export function sharedSecretAuth({ secret, applicationId, ledgerId }) {
  return async (scope) => mintToken({ secret, applicationId, ledgerId, ...scope });
}

/**
 * Real-validator auth: a participant in a live network will not accept a token
 * we signed ourselves, so we fetch one from the operator's OIDC provider using
 * the client-credentials grant.
 *
 * The important difference is not the signature, it is who decides what we may
 * do. Here the token says only "I am the Selkie application" — the actAs rights
 * come from the user's rights on the participant, granted once at onboarding.
 * So the per-call scope is deliberately ignored: asking for rights in a claim
 * we control would be asking ourselves for permission.
 */
/**
 * How long we may hold a token, given how long it lives.
 *
 * Always strictly less than its lifetime: a token handed to a request just
 * before it expires fails at the participant, and that failure looks like a
 * permissions bug rather than a clock one. Subtracting a fixed skew breaks down
 * when a provider issues tokens shorter-lived than the skew itself, so in that
 * case we fall back to spending half the life and refreshing.
 */
export function cacheWindowSeconds(lifetimeSeconds, clockSkewSeconds) {
  const afterSkew = lifetimeSeconds - clockSkewSeconds;
  const window = afterSkew > 0 ? afterSkew : lifetimeSeconds / 2;
  // Keep a margin even if someone configures the skew to zero: the guarantee
  // is a property of this function, not of how it is called.
  return Math.max(Math.min(window, lifetimeSeconds * 0.9), 1);
}

export function clientCredentialsAuth({
  tokenUrl,
  clientId,
  clientSecret,
  audience,
  scope,
  clockSkewSeconds = 60,
}) {
  let cached = null;

  return async () => {
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const form = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (audience) form.set("audience", audience);
    if (scope) form.set("scope", scope);

    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new LedgerError(`token endpoint refused us: ${text.slice(0, 300)}`, {
        status: res.status,
      });
    }

    const json = JSON.parse(text);
    if (!json.access_token) throw new LedgerError("token endpoint returned no access_token");

    const lifetime = Number(json.expires_in ?? 3600);
    cached = {
      token: json.access_token,
      expiresAt: Date.now() + cacheWindowSeconds(lifetime, clockSkewSeconds) * 1000,
    };
    return cached.token;
  };
}

export class LedgerError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "LedgerError";
    this.status = status;
    this.body = body;
  }
}

export class Ledger {
  /**
   * @param {object} cfg
   * @param {string} cfg.baseUrl   - JSON API base, e.g. http://localhost:7575
   * @param {string} [cfg.secret]  - JWT signing secret (dev sandbox only)
   * @param {(scope: object) => Promise<string>} [cfg.auth] - token provider;
   *   pass clientCredentialsAuth() to run against a real validator
   * @param {string} cfg.ledgerId
   * @param {string} cfg.applicationId
   * @param {string} cfg.pkgId     - main package id of the Selkie DAR
   */
  constructor({ baseUrl, secret, auth, ledgerId, applicationId = "selkie", pkgId }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secret = secret;
    this.ledgerId = ledgerId;
    this.applicationId = applicationId;
    this.pkgId = pkgId;
    this.auth = auth ?? sharedSecretAuth({ secret, applicationId, ledgerId });
  }

  /** Fully-qualified template id the JSON API expects. */
  tid(module, template) {
    return `${this.pkgId}:Selkie.${module}:${template}`;
  }

  token({ actAs = [], readAs = [], admin = false } = {}) {
    return this.auth({ actAs, readAs, admin });
  }

  async post(path, body, auth) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await this.token(auth)}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new LedgerError(`non-JSON response from ${path}: ${text.slice(0, 200)}`, {
        status: res.status,
      });
    }
    if (!res.ok || json.status >= 400) {
      const detail = Array.isArray(json.errors) ? json.errors.join("; ") : text.slice(0, 300);
      throw new LedgerError(detail, { status: json.status ?? res.status, body: json });
    }
    return json.result;
  }

  // --- party management -----------------------------------------------

  async allocateParty(hint) {
    return this.post("/v1/parties/allocate", { identifierHint: hint }, { admin: true });
  }

  async listParties() {
    const res = await fetch(`${this.baseUrl}/v1/parties`, {
      headers: { authorization: `Bearer ${await this.token({ admin: true })}` },
    });
    const json = await res.json();
    return json.result ?? [];
  }

  // --- contracts --------------------------------------------------------

  async create(templateId, payload, actAs) {
    return this.post("/v1/create", { templateId, payload }, { actAs });
  }

  async exercise(templateId, contractId, choice, argument, actAs) {
    return this.post("/v1/exercise", { templateId, contractId, choice, argument }, { actAs });
  }

  async exerciseByKey(templateId, key, choice, argument, actAs) {
    return this.post("/v1/exercise", { templateId, key, choice, argument }, { actAs });
  }

  async query(templateIds, query, readAs) {
    return this.post("/v1/query", { templateIds, query }, { actAs: readAs });
  }

  async fetchByKey(templateId, key, readAs) {
    try {
      return await this.post("/v1/fetch", { templateId, key }, { actAs: readAs });
    } catch (err) {
      if (err.status === 404) return null;
      throw err;
    }
  }
}

/**
 * Build a Ledger from the environment. One code path, two very different
 * deployments: a local sandbox that trusts tokens we sign ourselves, and a real
 * validator that trusts only its OIDC provider. Setting SELKIE_AUTH_TOKEN_URL
 * is what flips it — there is no separate "production build".
 */
export function ledgerFromEnv(env = process.env) {
  const tokenUrl = env.SELKIE_AUTH_TOKEN_URL;
  const shared = {
    baseUrl: env.SELKIE_JSON_API ?? "http://localhost:7575",
    ledgerId: env.SELKIE_LEDGER_ID ?? "sandbox",
    applicationId: env.SELKIE_APPLICATION_ID ?? "selkie",
    pkgId: env.SELKIE_PKG_ID,
  };

  if (!tokenUrl) {
    return {
      ledger: new Ledger({ ...shared, secret: env.SELKIE_JWT_SECRET ?? "secret" }),
      live: false,
    };
  }

  const missing = ["SELKIE_AUTH_CLIENT_ID", "SELKIE_AUTH_CLIENT_SECRET"].filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`SELKIE_AUTH_TOKEN_URL is set, so these are required too: ${missing.join(", ")}`);
  }

  return {
    ledger: new Ledger({
      ...shared,
      auth: clientCredentialsAuth({
        tokenUrl,
        clientId: env.SELKIE_AUTH_CLIENT_ID,
        clientSecret: env.SELKIE_AUTH_CLIENT_SECRET,
        audience: env.SELKIE_AUTH_AUDIENCE,
        scope: env.SELKIE_AUTH_SCOPE,
      }),
    }),
    live: true,
  };
}
