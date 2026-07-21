// Canton JSON Ledger API v2 client. No dependencies: node's fetch + crypto only.
//
// Selkie runs the hosted-party model — the operator's participant hosts every
// user's party, so the operator can submit on their behalf (actAs).
//
// This talks v2, which is what Canton 3.x speaks. The v1 API this project used
// against the Daml 2.x sandbox does not exist on a real participant, and the
// difference is not cosmetic: v2 dropped server-side query-by-attribute, reads
// are taken against an explicit ledger offset, and tokens are ordinary JWTs
// rather than the daml.com custom-claim objects 2.x wanted.

import { createHmac, randomUUID } from "node:crypto";

const b64url = (s) => Buffer.from(s).toString("base64url");

/**
 * Mint a Canton 3 access token.
 *
 * Note what is absent: no actAs/readAs/admin claims. Canton 3 derives rights
 * from the user's rights on the participant, keyed by `sub`. A client cannot
 * grant itself anything by writing claims, which is why this takes a user id
 * rather than a permission scope.
 */
export function mintToken({ secret, userId, audience, lifetimeSeconds = 3600 }) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: userId,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(input).digest("base64url");
  return `${input}.${sig}`;
}

/**
 * LocalNet auth: the participant is configured with `unsafe-jwt-hmac-256` and a
 * shared secret, so we can sign our own tokens. Real deployments use an OIDC
 * provider instead; see clientCredentialsAuth.
 */
export function sharedSecretAuth({ secret = "unsafe", userId, audience }) {
  return async () => mintToken({ secret, userId, audience });
}

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

/**
 * Real-validator auth: a participant in a live network will not accept a token
 * we signed ourselves, so we fetch one from the operator's OIDC provider.
 *
 * Which grant depends on the operator, not on us. A validator we run ourselves
 * issues the app its own credentials (client_credentials); a shared node hands
 * out human logins instead, so the app authenticates as a person (password).
 * Both end at the same place: a token the participant minted, carrying rights
 * it decided we have.
 */
export function oauthAuth({ tokenUrl, grant, clockSkewSeconds = 60 }) {
  let cached = null;

  return async () => {
    if (cached && Date.now() < cached.expiresAt) return cached.token;

    const form = new URLSearchParams(
      Object.fromEntries(Object.entries(grant).filter(([, v]) => v != null && v !== "")),
    );

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

/** An app authenticating as itself, on a validator we control. */
export function clientCredentialsAuth({ tokenUrl, clientId, clientSecret, audience, scope }) {
  return oauthAuth({
    tokenUrl,
    grant: {
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience,
      scope,
    },
  });
}

/**
 * An app authenticating as a human, which is how a shared node works: the
 * operator onboards a person through the wallet UI, and the app borrows that
 * login. Selkie's parties therefore live under someone's account rather than
 * under the application's own identity.
 */
export function passwordAuth({ tokenUrl, clientId, username, password, scope }) {
  return oauthAuth({
    tokenUrl,
    grant: {
      grant_type: "password",
      client_id: clientId,
      username,
      password,
      scope: scope ?? "openid daml_ledger_api offline_access",
    },
  });
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
   * @param {string} cfg.baseUrl - JSON API base, e.g. http://localhost:3975
   * @param {() => Promise<string>} [cfg.auth] - token provider
   * @param {string} cfg.userId - ledger API user the token speaks for
   * @param {string} cfg.pkgId - main package id of the Selkie DAR
   */
  constructor({
    baseUrl,
    auth,
    secret,
    userId = "ledger-api-user",
    audience,
    pkgId,
    pkgName = "selkie",
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.userId = userId;
    this.pkgId = pkgId;
    this.pkgName = pkgName;
    this.auth = auth ?? sharedSecretAuth({ secret, userId, audience });
  }

  /** Fully-qualified template id, pinned to the exact package we built. */
  tid(module, template) {
    return `${this.pkgId}:Selkie.${module}:${template}`;
  }

  /**
   * The same template, named by package rather than by hash.
   *
   * Commands accept a package id, but event filters reject one and want a
   * package name, so the two forms are not interchangeable. Reads use this;
   * writes use `tid`, which stays pinned to the exact package we compiled
   * against so an upgrade cannot silently change what a command means.
   */
  nameTid(templateId) {
    return templateId.replace(/^[^:]+:/, `#${this.pkgName}:`);
  }

  token() {
    return this.auth();
  }

  async request(path, { method = "GET", body } = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.token()}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      throw new LedgerError(`non-JSON response from ${path}: ${text.slice(0, 200)}`, {
        status: res.status,
      });
    }
    if (!res.ok) {
      throw new LedgerError(json.cause ?? json.error ?? text.slice(0, 300), {
        status: res.status,
        body: json,
      });
    }
    return json;
  }

  // --- party management -----------------------------------------------

  async allocateParty(hint) {
    const res = await this.request("/v2/parties", {
      method: "POST",
      body: { partyIdHint: hint },
    });
    // v1 called this `identifier`; keep that name so callers do not care.
    return { identifier: res.partyDetails?.party ?? res.party };
  }

  async listParties() {
    const res = await this.request("/v2/parties");
    return (res.partyDetails ?? []).map((p) => ({ identifier: p.party, isLocal: p.isLocal }));
  }

  // --- user rights ------------------------------------------------------
  //
  // Listing every party on a participant is an admin operation a shared node
  // will refuse. Reading our own rights is not, and it tells us the same thing
  // we actually need: which parties we may act for. On a shared node the
  // operator pre-creates parties and grants us actAs; this is how we find them
  // without ever being an admin.

  /** Full party ids this user may act as, as decided by the participant. */
  async myActAsParties() {
    const res = await this.request(`/v2/users/${encodeURIComponent(this.userId)}/rights`);
    return (res.rights ?? []).map((r) => r.kind?.CanActAs?.value?.party).filter(Boolean);
  }

  /**
   * Grant this user actAs on a party. Admin-only, so this works on a node we
   * run (LocalNet) and is refused on a shared one — where the operator does it
   * for us instead. Allocation and this grant always travel together: a party
   * we allocated but cannot act for is useless to us.
   */
  async grantActAs(party) {
    await this.request(`/v2/users/${encodeURIComponent(this.userId)}/rights`, {
      method: "POST",
      body: { userId: this.userId, rights: [{ kind: { CanActAs: { value: { party } } } }] },
    });
  }

  // --- commands ---------------------------------------------------------

  /**
   * Submit commands as one atomic transaction.
   *
   * Taking a list rather than a single command is deliberate: it is what lets
   * handle registration and account creation commit together, which is the
   * only reason the directory cannot end up holding an orphan entry.
   */
  async submit(commands, actAs, readAs = []) {
    const parties = [...new Set([...actAs, ...readAs])];
    const res = await this.request("/v2/commands/submit-and-wait-for-transaction", {
      method: "POST",
      // The JsCommands envelope nests under `commands`, so the field name
      // appears twice: the outer group, and the list of commands inside it.
      body: {
        commands: {
          commands,
          commandId: randomUUID(),
          userId: this.userId,
          actAs,
          readAs,
        },
        // The default shape is ACS_DELTA, which reports created and archived
        // contracts but not the choices that produced them. Selkie needs the
        // return value of Credit and Merge, so ask for ledger effects.
        transactionFormat: {
          transactionShape: "TRANSACTION_SHAPE_LEDGER_EFFECTS",
          eventFormat: {
            filtersByParty: Object.fromEntries(
              parties.map((p) => [
                p,
                { cumulative: [{ identifierFilter: { WildcardFilter: { value: {} } } }] },
              ]),
            ),
            verbose: true,
          },
        },
      },
    });
    return res.transaction ?? res;
  }

  /** Created events in a transaction, in order. */
  static created(tx) {
    return (tx.events ?? []).map((e) => e.CreatedEvent).filter(Boolean);
  }

  /** The result value of the first exercised choice in a transaction. */
  static exerciseResult(tx) {
    for (const e of tx.events ?? []) {
      if (e.ExercisedEvent) return e.ExercisedEvent.exerciseResult;
    }
    return undefined;
  }

  async create(templateId, payload, actAs) {
    const tx = await this.submit(
      [{ CreateCommand: { templateId, createArguments: payload } }],
      actAs,
    );
    const ev = Ledger.created(tx)[0];
    return { contractId: ev?.contractId, payload: ev?.createArgument, tx };
  }

  async exercise(templateId, contractId, choice, argument, actAs) {
    const tx = await this.submit(
      [{ ExerciseCommand: { templateId, contractId, choice, choiceArgument: argument } }],
      actAs,
    );
    return { exerciseResult: Ledger.exerciseResult(tx), tx };
  }

  // --- reads ------------------------------------------------------------

  async ledgerEnd() {
    const res = await this.request("/v2/state/ledger-end");
    return res.offset;
  }

  /**
   * Active contracts for the given templates, optionally narrowed by field.
   *
   * v2 removed query-by-attribute, so `match` is applied here rather than at
   * the participant. The filter stays in this signature anyway: call sites
   * saying what they want keeps the intent readable, and it is where the work
   * would move back to if the API ever grows the capability again.
   */
  async query(templateIds, match = {}, readAs = []) {
    const activeAtOffset = await this.ledgerEnd();
    const cumulative = templateIds.map((templateId) => ({
      identifierFilter: {
        TemplateFilter: {
          value: { templateId: this.nameTid(templateId), includeCreatedEventBlob: false },
        },
      },
    }));
    const filtersByParty = Object.fromEntries(readAs.map((p) => [p, { cumulative }]));

    const res = await this.request("/v2/state/active-contracts", {
      method: "POST",
      body: {
        activeAtOffset,
        eventFormat: {
          ...(readAs.length ? { filtersByParty } : { filtersForAnyParty: { cumulative } }),
          verbose: true,
        },
      },
    });

    const entries = Array.isArray(res) ? res : (res.activeContracts ?? []);
    const contracts = entries
      .map((e) => {
        const ev =
          e.contractEntry?.JsActiveContract?.createdEvent ??
          e.JsActiveContract?.createdEvent ??
          e.createdEvent;
        return ev ? { contractId: ev.contractId, payload: ev.createArgument } : null;
      })
      .filter(Boolean);

    const wanted = Object.entries(match);
    if (!wanted.length) return contracts;
    return contracts.filter((c) => wanted.every(([k, v]) => c.payload?.[k] === v));
  }

  /** First active contract matching, or null. */
  async queryOne(templateIds, match, readAs) {
    const [first] = await this.query(templateIds, match, readAs);
    return first ?? null;
  }
}

/**
 * Build a Ledger from the environment. One code path, two deployments: a
 * LocalNet participant configured with a shared secret, and a real validator
 * that trusts only its OIDC provider. Setting SELKIE_AUTH_TOKEN_URL flips it.
 */
export function ledgerFromEnv(env = process.env) {
  const tokenUrl = env.SELKIE_AUTH_TOKEN_URL;
  const shared = {
    baseUrl: env.SELKIE_JSON_API ?? "http://localhost:3975",
    userId: env.SELKIE_LEDGER_USER ?? "ledger-api-user",
    audience: env.SELKIE_AUTH_AUDIENCE ?? "https://canton.network.global",
    pkgId: env.SELKIE_PKG_ID,
  };

  if (!tokenUrl) {
    return {
      ledger: new Ledger({ ...shared, secret: env.SELKIE_JWT_SECRET ?? "unsafe" }),
      live: false,
    };
  }

  // A password grant means a shared node, where we log in as a person. A
  // client-secret means a validator that issued the app its own identity.
  const password = env.SELKIE_AUTH_PASSWORD;
  const required = password
    ? ["SELKIE_AUTH_CLIENT_ID", "SELKIE_AUTH_USERNAME"]
    : ["SELKIE_AUTH_CLIENT_ID", "SELKIE_AUTH_CLIENT_SECRET"];
  const missing = required.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(`SELKIE_AUTH_TOKEN_URL is set, so these are required too: ${missing.join(", ")}`);
  }

  const auth = password
    ? passwordAuth({
        tokenUrl,
        clientId: env.SELKIE_AUTH_CLIENT_ID,
        username: env.SELKIE_AUTH_USERNAME,
        password,
        scope: env.SELKIE_AUTH_SCOPE,
      })
    : clientCredentialsAuth({
        tokenUrl,
        clientId: env.SELKIE_AUTH_CLIENT_ID,
        clientSecret: env.SELKIE_AUTH_CLIENT_SECRET,
        audience: env.SELKIE_AUTH_AUDIENCE,
        scope: env.SELKIE_AUTH_SCOPE,
      });

  return { ledger: new Ledger({ ...shared, auth }), live: true };
}
