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
   * @param {string} cfg.secret    - JWT signing secret (dev sandbox)
   * @param {string} cfg.ledgerId
   * @param {string} cfg.applicationId
   * @param {string} cfg.pkgId     - main package id of the Selkie DAR
   */
  constructor({ baseUrl, secret, ledgerId, applicationId = "selkie", pkgId }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.secret = secret;
    this.ledgerId = ledgerId;
    this.applicationId = applicationId;
    this.pkgId = pkgId;
  }

  /** Fully-qualified template id the JSON API expects. */
  tid(module, template) {
    return `${this.pkgId}:Selkie.${module}:${template}`;
  }

  token({ actAs = [], readAs = [], admin = false } = {}) {
    return mintToken({
      secret: this.secret,
      applicationId: this.applicationId,
      ledgerId: this.ledgerId,
      actAs,
      readAs,
      admin,
    });
  }

  async post(path, body, auth) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.token(auth)}`,
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
      headers: { authorization: `Bearer ${this.token({ admin: true })}` },
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
