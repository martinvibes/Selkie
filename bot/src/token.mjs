// One client for every CIP-56 token Selkie accepts at a handle's own party.
//
// Canton Coin (Amulet) and cBTC implement the SAME token-standard interfaces:
// a transfer to you lands as a TransferInstruction you accept, and what you own
// sits as Holding contracts. So accepting an incoming deposit at a handle's own
// Canton party is the exact same dance for both. The only things that differ:
//
//   - the instrument id we filter for ("Amulet" vs "CBTC"), and
//   - where the accept's choice context comes from: Amulet's is the validator
//     scan-proxy, which needs our bearer token; cBTC's is the issuer's public
//     registry, which needs none.
//
// We accept as the handle's own party (Selkie holds act-as on the whole pool),
// so the real token ends up owned by the user's own address. The internal
// Selkie balance is credited 1:1 to mirror it — see the deposit-claim path.

import { randomUUID } from "node:crypto";
import { passwordGrantAuth } from "./cbtc.mjs";

const HOLDING_VIEW = "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const TRANSFER_INSTRUCTION =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";

export class TokenParty {
  /**
   * @param {object} cfg
   * @param {string} cfg.ledgerUrl - participant JSON Ledger API v2 base
   * @param {string} cfg.registryUrl - base that serves the accept choice context
   * @param {boolean} [cfg.registryAuthed] - send our bearer to the registry (Amulet: yes)
   * @param {string} cfg.userId - ledger user that holds act-as on the pool
   * @param {() => Promise<string>} cfg.auth - bearer token supplier
   * @param {string} cfg.instrument - on-ledger instrument id ("Amulet" | "CBTC")
   * @param {string} cfg.asset - Selkie's internal asset code this maps to ("CC" | "CBTC")
   * @param {string} [cfg.label] - human name for logs and receipts
   */
  constructor({ ledgerUrl, registryUrl, registryAuthed = false, userId, auth, instrument, asset, label }) {
    this.ledgerUrl = ledgerUrl.replace(/\/$/, "");
    this.registryUrl = registryUrl.replace(/\/$/, "");
    this.registryAuthed = registryAuthed;
    this.userId = userId;
    this.auth = auth;
    this.instrument = instrument;
    this.asset = asset;
    this.label = label ?? asset;
  }

  async ledger(path, body) {
    const res = await fetch(`${this.ledgerUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${await this.auth()}`,
        "content-type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`ledger ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  /** Choice contexts. Amulet's scan-proxy needs our bearer; cBTC's is public. */
  async registry(path, body) {
    const headers = { "content-type": "application/json" };
    if (this.registryAuthed) headers.authorization = `Bearer ${await this.auth()}`;
    const res = await fetch(`${this.registryUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`registry ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  /** Active contracts implementing an interface, as seen by `party`. */
  async #activeByInterface(party, interfaceId) {
    const { offset } = await this.ledger("/v2/state/ledger-end");
    const rows = await this.ledger("/v2/state/active-contracts", {
      filter: {
        filtersByParty: {
          [party]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: { interfaceId, includeInterfaceView: true, includeCreatedEventBlob: true },
                  },
                },
              },
            ],
          },
        },
      },
      verbose: false,
      activeAtOffset: offset,
    });
    return rows
      .map((r) => r.contractEntry?.JsActiveContract?.createdEvent)
      .filter(Boolean)
      .map((ev) => ({ cid: ev.contractId, view: ev.interfaceViews?.[0]?.viewValue ?? {} }));
  }

  /** Transfers of this instrument sent to `party` that nobody has accepted yet. */
  async pendingFor(party) {
    return (await this.#activeByInterface(party, TRANSFER_INSTRUCTION))
      .filter(
        (t) =>
          t.view.transfer?.instrumentId?.id === this.instrument &&
          t.view.transfer?.receiver === party,
      )
      .map((t) => ({
        cid: t.cid,
        sender: t.view.transfer.sender,
        amount: Number(t.view.transfer.amount),
      }));
  }

  /** Real, unlocked holdings of this instrument owned by `party`. */
  async holdingsFor(party) {
    const all = (await this.#activeByInterface(party, HOLDING_VIEW)).filter(
      (h) => h.view.instrumentId?.id === this.instrument && h.view.owner === party && !h.view.lock,
    );
    return all.reduce((n, h) => n + Number(h.view.amount), 0);
  }

  /**
   * Accept one incoming transfer, acting as the receiving party. The registry
   * computes the choice context (transfer rules, instrument config, and the
   * disclosed contracts our participant needs to validate), which we attach
   * verbatim.
   */
  async acceptFor(party, cid) {
    const ctx = await this.registry(
      `/registry/transfer-instruction/v1/${encodeURIComponent(cid)}/choice-contexts/accept`,
      { meta: {} },
    );
    const out = await this.ledger("/v2/commands/submit-and-wait", {
      commands: [
        {
          ExerciseCommand: {
            templateId: TRANSFER_INSTRUCTION,
            contractId: cid,
            choice: "TransferInstruction_Accept",
            choiceArgument: { extraArgs: { context: ctx.choiceContextData, meta: { values: {} } } },
          },
        },
      ],
      commandId: `selkie-accept-${randomUUID()}`,
      userId: this.userId,
      actAs: [party],
      readAs: [party],
      disclosedContracts: ctx.disclosedContracts ?? [],
    });
    return { cid, updateId: out.updateId };
  }
}

/**
 * Derive the validator scan-proxy base (Amulet's registry) from the participant
 * ledger URL. The hackathon hosts follow one scheme:
 *   ledger-api-json.participant.<cluster> -> validator-api-http.validator.<cluster>
 */
export function deriveScanProxy(ledgerUrl) {
  const host = ledgerUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host.startsWith("ledger-api-json.participant.")) return null;
  const validatorHost = host.replace("ledger-api-json.participant.", "validator-api-http.validator.");
  return `https://${validatorHost}/api/validator/v0/scan-proxy`;
}

/** Shared devnet credentials for the token clients (same Keycloak user as cBTC). */
function devnetAuth(env) {
  const ledgerUrl = env.SELKIE_CBTC_LEDGER;
  const tokenUrl = env.SELKIE_CBTC_TOKEN_URL;
  const clientId = env.SELKIE_CBTC_CLIENT_ID;
  const username = env.SELKIE_CBTC_USERNAME;
  const password = env.SELKIE_CBTC_PASSWORD;
  if (!ledgerUrl || !tokenUrl || !clientId || !username || !password) return null;
  return {
    ledgerUrl,
    userId: env.SELKIE_CBTC_USER ?? env.SELKIE_CBTC_PARTY?.split("::")[0],
    auth: passwordGrantAuth({ tokenUrl, clientId, username, password }),
  };
}

/**
 * Canton Coin (Amulet) accepted at each handle's own party. Returns null when
 * devnet auth is not configured, so the app runs unchanged on LocalNet.
 */
export function amuletParty(env = process.env) {
  const base = devnetAuth(env);
  if (!base) return null;
  const registryUrl = env.SELKIE_CC_SCAN_PROXY ?? deriveScanProxy(base.ledgerUrl);
  if (!registryUrl) {
    throw new Error("CC deposits need SELKIE_CC_SCAN_PROXY (could not derive it from the ledger URL)");
  }
  return new TokenParty({
    ...base,
    registryUrl,
    registryAuthed: true,
    instrument: "Amulet",
    asset: "CC",
    label: "Canton Coin",
  });
}

/**
 * cBTC accepted at each handle's own party, exactly like CC. The registry is
 * the issuer's public endpoint, namespaced by the instrument admin.
 */
export function cbtcParty(env = process.env) {
  const base = devnetAuth(env);
  const registry = env.SELKIE_CBTC_REGISTRY;
  const admin = env.SELKIE_CBTC_ADMIN;
  if (!base || !registry || !admin) return null;
  return new TokenParty({
    ...base,
    registryUrl: `${registry.replace(/\/$/, "")}/api/token-standard/v0/registrars/${admin}`,
    registryAuthed: false,
    instrument: "CBTC",
    asset: "CBTC",
    label: "cBTC",
  });
}
