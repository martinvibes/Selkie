// Real cBTC on Canton, via the CIP-56 token standard. No dependencies.
//
// cBTC deliberately has no API of its own. Holdings are ordinary token-standard
// contracts on the participant, and they move through two interfaces:
// TransferFactory (start a transfer) and TransferInstruction (accept one).
// Both choices need context the issuer computes off-ledger: which transfer rule
// applies, the instrument configuration, and the disclosed contracts that let
// our participant validate contracts it does not host. The issuer serves that
// context from a registry endpoint, so a transfer is always two calls:
//
//   registry:  give me the choice context for this transfer
//   ledger:    exercise the choice, attaching that context verbatim
//
// The registry never holds funds and never sees our token; it only reads the
// public shape of the instrument. Every state change happens on the ledger,
// signed by our party.

import { randomUUID } from "node:crypto";
import { cacheWindowSeconds } from "./ledger.mjs";

const HOLDING_VIEW =
  "#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding";
const TRANSFER_INSTRUCTION =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";
const TRANSFER_FACTORY =
  "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferFactory";

/**
 * OIDC resource-owner-password auth against the validator's Keycloak.
 *
 * The shared hackathon participant provisions one Keycloak user per builder
 * and derives ledger rights from the token's `sub`, exactly like the sandbox
 * derives them from the `sub` we sign ourselves. Tokens are cached until
 * shortly before expiry; see cacheWindowSeconds for why "shortly".
 */
export function passwordGrantAuth({ tokenUrl, clientId, username, password, scope }) {
  let cached = null;
  let expiresAt = 0;
  return async () => {
    if (cached && Date.now() < expiresAt) return cached;
    const res = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: clientId,
        username,
        password,
        scope: scope ?? "openid daml_ledger_api offline_access",
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) {
      throw new Error(`token endpoint refused: ${body.error_description ?? res.status}`);
    }
    cached = body.access_token;
    const lifetime = Number(body.expires_in ?? 300);
    expiresAt = Date.now() + cacheWindowSeconds(lifetime, 60) * 1000;
    return cached;
  };
}

export class Cbtc {
  /**
   * @param {object} cfg
   * @param {string} cfg.ledgerUrl - the participant's JSON Ledger API v2 base
   * @param {string} cfg.registryUrl - issuer registry base (DA Utility)
   * @param {string} cfg.admin - the instrument admin party (cbtc-network::...)
   * @param {string} cfg.party - our party on the participant
   * @param {string} cfg.userId - ledger user the token speaks for
   * @param {() => Promise<string>} cfg.auth - bearer token supplier
   * @param {string} [cfg.instrument] - instrument id, CBTC unless told otherwise
   */
  constructor({ ledgerUrl, registryUrl, admin, party, userId, auth, instrument = "CBTC" }) {
    this.ledgerUrl = ledgerUrl.replace(/\/$/, "");
    // The registry API is namespaced by which registrar you are asking about;
    // for cBTC that is the instrument admin itself.
    this.registryUrl = `${registryUrl.replace(/\/$/, "")}/api/token-standard/v0/registrars/${admin}`;
    this.admin = admin;
    this.party = party;
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

  /** Registry reads are public: no funds, no token, just choice contexts. */
  async registry(path, body) {
    const res = await fetch(`${this.registryUrl}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`registry ${path} -> ${res.status}: ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  /** Active contracts implementing an interface, as seen by our party. */
  async #activeByInterface(interfaceId) {
    const { offset } = await this.ledger("/v2/state/ledger-end");
    const rows = await this.ledger("/v2/state/active-contracts", {
      filter: {
        filtersByParty: {
          [this.party]: {
            cumulative: [
              {
                identifierFilter: {
                  InterfaceFilter: {
                    value: {
                      interfaceId,
                      includeInterfaceView: true,
                      includeCreatedEventBlob: true,
                    },
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

  /**
   * Our cBTC position. Locked holdings are in-flight transfers: the standard
   * escrows the sender's coins under the admin's lock until the receiver
   * accepts, so "locked" is money in motion, not money lost.
   */
  async holdings() {
    const all = (await this.#activeByInterface(HOLDING_VIEW)).filter(
      (h) => h.view.instrumentId?.id === this.instrument && h.view.owner === this.party,
    );
    const sum = (hs) => hs.reduce((n, h) => n + Number(h.view.amount), 0);
    const unlocked = all.filter((h) => !h.view.lock);
    return {
      total: sum(all),
      unlocked: sum(unlocked),
      contracts: all.map((h) => ({
        cid: h.cid,
        amount: Number(h.view.amount),
        locked: Boolean(h.view.lock),
      })),
    };
  }

  /** Transfers other parties started toward us and nobody accepted yet. */
  async pending() {
    return (await this.#activeByInterface(TRANSFER_INSTRUCTION))
      .filter(
        (t) =>
          t.view.transfer?.instrumentId?.id === this.instrument &&
          t.view.transfer?.receiver === this.party,
      )
      .map((t) => ({
        cid: t.cid,
        sender: t.view.transfer.sender,
        amount: Number(t.view.transfer.amount),
      }));
  }

  /** Exercise a token-standard choice with the registry's context attached. */
  async #exercise({ templateId, contractId, choice, argument, context }) {
    return this.ledger("/v2/commands/submit-and-wait", {
      commands: [
        { ExerciseCommand: { templateId, contractId, choice, choiceArgument: argument } },
      ],
      commandId: `selkie-cbtc-${randomUUID()}`,
      userId: this.userId,
      actAs: [this.party],
      readAs: [this.party],
      disclosedContracts: context.disclosedContracts ?? [],
    });
  }

  /** Accept one incoming transfer. Returns the on-ledger update id. */
  async accept(cid) {
    const context = await this.registry(
      `/registry/transfer-instruction/v1/${cid}/choice-contexts/accept`,
      { meta: {} },
    );
    const res = await this.#exercise({
      templateId: TRANSFER_INSTRUCTION,
      contractId: cid,
      choice: "TransferInstruction_Accept",
      argument: {
        extraArgs: { context: context.choiceContextData, meta: { values: {} } },
      },
      context,
    });
    return { cid, updateId: res.updateId };
  }

  /** Accept everything waiting for us, e.g. after tapping the faucet. */
  async acceptAll() {
    const results = [];
    for (const offer of await this.pending()) {
      results.push({ ...offer, ...(await this.accept(offer.cid)) });
    }
    return results;
  }

  /**
   * Send cBTC to another party on the network.
   *
   * The factory decides what the transfer becomes: to a party on our own
   * participant it can settle in one step, otherwise it creates a
   * TransferInstruction the receiver must accept. Either way the coins leave
   * our unlocked holdings atomically, which is why we pass every unlocked
   * contract as input and let the standard make change.
   */
  async send({ receiver, amount }) {
    const { unlocked, contracts } = await this.holdings();
    if (!(amount > 0)) throw new Error("amount must be positive");
    if (amount > unlocked) {
      throw new Error(`insufficient cBTC: have ${unlocked} unlocked, need ${amount}`);
    }
    const inputs = contracts.filter((c) => !c.locked).map((c) => c.cid);
    const now = Date.now();
    const transfer = {
      sender: this.party,
      receiver,
      amount: String(amount),
      instrumentId: { admin: this.admin, id: this.instrument },
      requestedAt: new Date(now).toISOString(),
      executeBefore: new Date(now + 24 * 3600 * 1000).toISOString(),
      inputHoldingCids: inputs,
      meta: { values: {} },
    };
    const factory = await this.registry("/registry/transfer-instruction/v1/transfer-factory", {
      choiceArguments: {
        expectedAdmin: this.admin,
        transfer,
        extraArgs: { context: { values: {} }, meta: { values: {} } },
      },
    });
    const context = factory.transferFactory?.choiceContext ?? factory.choiceContext ?? factory;
    const res = await this.#exercise({
      templateId: TRANSFER_FACTORY,
      contractId: factory.factoryId,
      choice: "TransferFactory_Transfer",
      argument: {
        expectedAdmin: this.admin,
        transfer,
        extraArgs: { context: context.choiceContextData, meta: { values: {} } },
      },
      context,
    });
    return { receiver, amount, updateId: res.updateId };
  }
}

/**
 * Build the devnet client from the environment, or decide we are local-only.
 *
 * All-or-nothing on purpose: a half-configured live setup should fail loudly
 * at boot, not quietly pretend the reserve is empty.
 */
export function cbtcFromEnv(env = process.env) {
  const wanted = [
    "SELKIE_CBTC_LEDGER",
    "SELKIE_CBTC_REGISTRY",
    "SELKIE_CBTC_ADMIN",
    "SELKIE_CBTC_PARTY",
    "SELKIE_CBTC_TOKEN_URL",
    "SELKIE_CBTC_CLIENT_ID",
    "SELKIE_CBTC_USERNAME",
    "SELKIE_CBTC_PASSWORD",
  ];
  const present = wanted.filter((k) => env[k]);
  if (present.length === 0) return null;
  if (present.length < wanted.length) {
    const missing = wanted.filter((k) => !env[k]);
    throw new Error(`cBTC devnet is partially configured; missing ${missing.join(", ")}`);
  }
  return new Cbtc({
    ledgerUrl: env.SELKIE_CBTC_LEDGER,
    registryUrl: env.SELKIE_CBTC_REGISTRY,
    admin: env.SELKIE_CBTC_ADMIN,
    party: env.SELKIE_CBTC_PARTY,
    userId: env.SELKIE_CBTC_USER ?? env.SELKIE_CBTC_PARTY.split("::")[0],
    auth: passwordGrantAuth({
      tokenUrl: env.SELKIE_CBTC_TOKEN_URL,
      clientId: env.SELKIE_CBTC_CLIENT_ID,
      username: env.SELKIE_CBTC_USERNAME,
      password: env.SELKIE_CBTC_PASSWORD,
    }),
  });
}
