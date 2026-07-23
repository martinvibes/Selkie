// Real Canton Coin (Amulet) deposits, via the CIP-56 token standard.
//
// When someone sends CC from the Canton Coin Wallet to a Selkie handle, it
// lands as an AmuletTransferInstruction addressed to that handle's own party
// (its pool party is its real Canton address). The coins sit there until the
// receiver accepts, exactly like cBTC. The difference from cBTC is only where
// the choice context comes from: Amulet's registry is the validator's
// scan-proxy, which needs our bearer token, whereas the cBTC registry is a
// public issuer endpoint. The accept itself is the same interface choice.
//
// We accept as the handle's own party (Selkie holds act-as rights on the whole
// pool), so the real CC ends up owned by the user's own address. The internal
// Selkie balance is then credited to mirror it — see the deposit-claim path.

import { randomUUID } from "node:crypto";
import { passwordGrantAuth } from "./cbtc.mjs";

const HOLDING_VIEW =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const TRANSFER_INSTRUCTION =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";

export class Amulet {
  /**
   * @param {object} cfg
   * @param {string} cfg.ledgerUrl   - participant JSON Ledger API v2 base
   * @param {string} cfg.scanProxyUrl - validator scan-proxy base (Amulet registry)
   * @param {string} cfg.userId      - ledger user that holds act-as on the pool
   * @param {() => Promise<string>} cfg.auth - bearer token supplier
   * @param {string} [cfg.instrument] - instrument id, Amulet unless told otherwise
   */
  constructor({ ledgerUrl, scanProxyUrl, userId, auth, instrument = "Amulet" }) {
    this.ledgerUrl = ledgerUrl.replace(/\/$/, "");
    this.scanProxyUrl = scanProxyUrl.replace(/\/$/, "");
    this.userId = userId;
    this.auth = auth;
    this.instrument = instrument;
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

  /** The Amulet registry (scan-proxy) needs our bearer token, unlike cBTC's. */
  async registry(path, body) {
    const res = await fetch(`${this.scanProxyUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.auth()}`,
        "content-type": "application/json",
      },
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

  /** CC transfers sent to `party` that nobody has accepted yet. */
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

  /** Real CC owned by `party` (accepted deposits sit here as their reserve). */
  async holdingsFor(party) {
    const all = (await this.#activeByInterface(party, HOLDING_VIEW)).filter(
      (h) => h.view.instrumentId?.id === this.instrument && h.view.owner === party && !h.view.lock,
    );
    return all.reduce((n, h) => n + Number(h.view.amount), 0);
  }

  /**
   * Accept one incoming CC transfer, acting as the receiving party. The scan
   * proxy computes the choice context (the open mining round and the amulet
   * rules), which we attach verbatim as disclosed contracts.
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
      commandId: `selkie-cc-${randomUUID()}`,
      userId: this.userId,
      actAs: [party],
      readAs: [party],
      disclosedContracts: ctx.disclosedContracts ?? [],
    });
    return { cid, updateId: out.updateId };
  }
}

/**
 * Derive the validator scan-proxy base from the participant ledger URL when it
 * is not given explicitly. The hackathon hosts follow one naming scheme:
 *   ledger-api-json.participant.<cluster>  ->  validator-api-http.validator.<cluster>
 */
function deriveScanProxy(ledgerUrl) {
  const host = ledgerUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!host.startsWith("ledger-api-json.participant.")) return null;
  const validatorHost = host.replace("ledger-api-json.participant.", "validator-api-http.validator.");
  return `https://${validatorHost}/api/validator/v0/scan-proxy`;
}

/**
 * Build the CC deposit client from the environment, reusing the same Keycloak
 * credentials as cBTC. Returns null when devnet auth is not configured, so the
 * app runs unchanged on LocalNet.
 */
export function amuletFromEnv(env = process.env) {
  const ledgerUrl = env.SELKIE_CBTC_LEDGER;
  const tokenUrl = env.SELKIE_CBTC_TOKEN_URL;
  const clientId = env.SELKIE_CBTC_CLIENT_ID;
  const username = env.SELKIE_CBTC_USERNAME;
  const password = env.SELKIE_CBTC_PASSWORD;
  if (!ledgerUrl || !tokenUrl || !clientId || !username || !password) return null;

  const scanProxyUrl = env.SELKIE_CC_SCAN_PROXY ?? deriveScanProxy(ledgerUrl);
  if (!scanProxyUrl) {
    throw new Error("CC deposits need SELKIE_CC_SCAN_PROXY (could not derive it from the ledger URL)");
  }
  return new Amulet({
    ledgerUrl,
    scanProxyUrl,
    userId: env.SELKIE_CBTC_USER ?? env.SELKIE_CBTC_PARTY.split("::")[0],
    auth: passwordGrantAuth({ tokenUrl, clientId, username, password }),
  });
}
