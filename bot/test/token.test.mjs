// The generic per-party token client, exercised for both instruments. The
// ledger and registry are faked by stubbing fetch, so we check request shapes
// without a live node: that pendingFor filters to this instrument + party, that
// acceptFor fetches the choice context and exercises TransferInstruction_Accept
// as the party with the disclosed contracts, and that the cBTC registry is
// called WITHOUT a bearer while Amulet's scan-proxy is called WITH one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TokenParty, amuletParty, cbtcParty } from "../src/token.mjs";

const TI = "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";
const PARTY = "selkie-pool-10::12200abc";

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body });
    for (const [match, make] of routes) {
      if (url.includes(match)) return { ok: true, status: 200, text: async () => JSON.stringify(make(body)) };
    }
    return { ok: false, status: 404, text: async () => "no route" };
  };
  return calls;
}

const acsRow = (view) => ({
  contractEntry: { JsActiveContract: { createdEvent: { contractId: "c1", interfaceViews: [{ viewValue: view }] } } },
});

const make = (overrides = {}) =>
  new TokenParty({
    ledgerUrl: "https://ledger.example",
    registryUrl: "https://registry.example/base",
    userId: "u",
    auth: async () => "tok",
    instrument: "CBTC",
    asset: "CBTC",
    ...overrides,
  });

test("pendingFor keeps only this instrument's transfers addressed to the party", async () => {
  stubFetch([
    ["/v2/state/ledger-end", () => ({ offset: "10" })],
    ["/v2/state/active-contracts", () => [
      acsRow({ transfer: { instrumentId: { id: "CBTC" }, receiver: PARTY, sender: "s1", amount: "1.5" } }),
      acsRow({ transfer: { instrumentId: { id: "Amulet" }, receiver: PARTY, sender: "s2", amount: "9" } }), // wrong asset
      acsRow({ transfer: { instrumentId: { id: "CBTC" }, receiver: "someone-else", sender: "s3", amount: "5" } }), // not us
    ]],
  ]);
  const pend = await make().pendingFor(PARTY);
  assert.equal(pend.length, 1);
  assert.deepEqual(pend[0], { cid: "c1", sender: "s1", amount: 1.5 });
});

test("holdingsFor sums unlocked holdings of this instrument owned by the party", async () => {
  stubFetch([
    ["/v2/state/ledger-end", () => ({ offset: "10" })],
    ["/v2/state/active-contracts", () => [
      acsRow({ instrumentId: { id: "CBTC" }, owner: PARTY, amount: "0.6" }),
      acsRow({ instrumentId: { id: "CBTC" }, owner: PARTY, amount: "0.4" }),
      acsRow({ instrumentId: { id: "CBTC" }, owner: PARTY, amount: "9", lock: { holders: [] } }), // locked, excluded
    ]],
  ]);
  assert.equal(await make().holdingsFor(PARTY), 1);
});

test("acceptFor fetches the context and exercises the accept as the party", async () => {
  const calls = stubFetch([
    ["/choice-contexts/accept", () => ({ choiceContextData: { values: { round: 1 } }, disclosedContracts: [{ contractId: "d1" }] })],
    ["/v2/commands/submit-and-wait", () => ({ updateId: "u9" })],
  ]);
  const res = await make().acceptFor(PARTY, "cidX");
  assert.deepEqual(res, { cid: "cidX", updateId: "u9" });

  const ctx = calls.find((c) => c.url.includes("/choice-contexts/accept"));
  assert.ok(ctx.url.includes("/base/registry/transfer-instruction/v1/cidX/choice-contexts/accept"));

  const ex = calls.find((c) => c.url.includes("/v2/commands/submit-and-wait"));
  const cmd = ex.body.commands[0].ExerciseCommand;
  assert.equal(cmd.templateId, TI);
  assert.equal(cmd.contractId, "cidX");
  assert.equal(cmd.choice, "TransferInstruction_Accept");
  assert.deepEqual(cmd.choiceArgument.extraArgs.context, { values: { round: 1 } });
  assert.deepEqual(ex.body.actAs, [PARTY]);
  assert.deepEqual(ex.body.disclosedContracts, [{ contractId: "d1" }]);
});

test("cBTC's registry is called without a bearer; Amulet's scan-proxy with one", async () => {
  // cBTC registry: public.
  let calls = stubFetch([["/choice-contexts/accept", () => ({ choiceContextData: {}, disclosedContracts: [] })], ["submit-and-wait", () => ({ updateId: "u" })]]);
  await make({ registryAuthed: false }).acceptFor(PARTY, "c");
  let reg = calls.find((c) => c.url.includes("/choice-contexts/accept"));
  assert.equal(reg.headers.authorization, undefined, "public registry gets no bearer");

  // Amulet registry: authed.
  calls = stubFetch([["/choice-contexts/accept", () => ({ choiceContextData: {}, disclosedContracts: [] })], ["submit-and-wait", () => ({ updateId: "u" })]]);
  await make({ registryAuthed: true }).acceptFor(PARTY, "c");
  reg = calls.find((c) => c.url.includes("/choice-contexts/accept"));
  assert.equal(reg.headers.authorization, "Bearer tok", "scan-proxy gets our bearer");
});

test("amuletParty derives the scan-proxy and maps Amulet -> CC", () => {
  const a = amuletParty({
    SELKIE_CBTC_LEDGER: "https://ledger-api-json.participant.hackcanton-01.devnet.naas.noders.services",
    SELKIE_CBTC_TOKEN_URL: "https://kc/token",
    SELKIE_CBTC_CLIENT_ID: "client",
    SELKIE_CBTC_USERNAME: "u",
    SELKIE_CBTC_PASSWORD: "p",
    SELKIE_CBTC_PARTY: "op::1220",
  });
  assert.equal(a.instrument, "Amulet");
  assert.equal(a.asset, "CC");
  assert.equal(a.registryAuthed, true);
  assert.equal(
    a.registryUrl,
    "https://validator-api-http.validator.hackcanton-01.devnet.naas.noders.services/api/validator/v0/scan-proxy",
  );
});

test("cbtcParty points at the issuer registrar and maps CBTC -> CBTC, public", () => {
  const c = cbtcParty({
    SELKIE_CBTC_LEDGER: "https://ledger-api-json.participant.hackcanton-01.devnet.naas.noders.services",
    SELKIE_CBTC_TOKEN_URL: "https://kc/token",
    SELKIE_CBTC_CLIENT_ID: "client",
    SELKIE_CBTC_USERNAME: "u",
    SELKIE_CBTC_PASSWORD: "p",
    SELKIE_CBTC_PARTY: "op::1220",
    SELKIE_CBTC_REGISTRY: "https://api.utilities.digitalasset-dev.com",
    SELKIE_CBTC_ADMIN: "cbtc-network::1220ff",
  });
  assert.equal(c.instrument, "CBTC");
  assert.equal(c.asset, "CBTC");
  assert.equal(c.registryAuthed, false);
  assert.equal(
    c.registryUrl,
    "https://api.utilities.digitalasset-dev.com/api/token-standard/v0/registrars/cbtc-network::1220ff",
  );
});

test("both factories are null when devnet auth is absent", () => {
  assert.equal(amuletParty({}), null);
  assert.equal(cbtcParty({}), null);
});
