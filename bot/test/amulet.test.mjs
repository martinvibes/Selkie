// CC (Amulet) deposit client. The ledger and the scan-proxy registry are
// faked by stubbing fetch, so we check the request shapes without a live node:
// that pendingFor filters to Amulet transfers for the party, and that acceptFor
// fetches the choice context and exercises TransferInstruction_Accept as that
// party with the disclosed contracts attached.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Amulet, amuletFromEnv } from "../src/amulet.mjs";

const TI = "#splice-api-token-transfer-instruction-v1:Splice.Api.Token.TransferInstructionV1:TransferInstruction";
const PARTY = "selkie-pool-10::12200abc";

function stubFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method: init.method ?? "GET", body });
    for (const [match, make] of routes) {
      if (url.includes(match)) {
        return { ok: true, status: 200, text: async () => JSON.stringify(make(body)) };
      }
    }
    return { ok: false, status: 404, text: async () => "no route" };
  };
  return calls;
}

const acsRow = (view) => ({
  contractEntry: { JsActiveContract: { createdEvent: { contractId: "c1", interfaceViews: [{ viewValue: view }] } } },
});

function make(overrides = {}) {
  return new Amulet({
    ledgerUrl: "https://ledger.example",
    scanProxyUrl: "https://validator.example/scan-proxy",
    userId: "u",
    auth: async () => "tok",
    ...overrides,
  });
}

test("pendingFor keeps only Amulet transfers addressed to the party", async () => {
  stubFetch([
    ["/v2/state/ledger-end", () => ({ offset: "10" })],
    ["/v2/state/active-contracts", () => [
      acsRow({ transfer: { instrumentId: { id: "Amulet" }, receiver: PARTY, sender: "s1", amount: "100.0" } }),
      acsRow({ transfer: { instrumentId: { id: "CBTC" }, receiver: PARTY, sender: "s2", amount: "1.0" } }),   // wrong asset
      acsRow({ transfer: { instrumentId: { id: "Amulet" }, receiver: "someone-else", sender: "s3", amount: "5" } }), // not us
    ]],
  ]);
  const pend = await make().pendingFor(PARTY);
  assert.equal(pend.length, 1);
  assert.deepEqual(pend[0], { cid: "c1", sender: "s1", amount: 100 });
});

test("holdingsFor sums unlocked Amulet owned by the party", async () => {
  stubFetch([
    ["/v2/state/ledger-end", () => ({ offset: "10" })],
    ["/v2/state/active-contracts", () => [
      acsRow({ instrumentId: { id: "Amulet" }, owner: PARTY, amount: "60" }),
      acsRow({ instrumentId: { id: "Amulet" }, owner: PARTY, amount: "40" }),
      acsRow({ instrumentId: { id: "Amulet" }, owner: PARTY, amount: "999", lock: { holders: [] } }), // locked, excluded
    ]],
  ]);
  assert.equal(await make().holdingsFor(PARTY), 100);
});

test("acceptFor fetches the context and exercises the accept as the party", async () => {
  const calls = stubFetch([
    ["/choice-contexts/accept", () => ({ choiceContextData: { values: { round: 1 } }, disclosedContracts: [{ contractId: "d1" }] })],
    ["/v2/commands/submit-and-wait", () => ({ updateId: "u9" })],
  ]);
  const res = await make().acceptFor(PARTY, "cidX");
  assert.deepEqual(res, { cid: "cidX", updateId: "u9" });

  const ctx = calls.find((c) => c.url.includes("/choice-contexts/accept"));
  assert.ok(ctx.url.includes("/scan-proxy/registry/transfer-instruction/v1/cidX/choice-contexts/accept"));
  assert.ok(ctx.url.startsWith("https://validator.example"), "context comes from the scan-proxy");

  const ex = calls.find((c) => c.url.includes("/v2/commands/submit-and-wait"));
  const cmd = ex.body.commands[0].ExerciseCommand;
  assert.equal(cmd.templateId, TI);
  assert.equal(cmd.contractId, "cidX");
  assert.equal(cmd.choice, "TransferInstruction_Accept");
  assert.deepEqual(cmd.choiceArgument.extraArgs.context, { values: { round: 1 } });
  assert.deepEqual(ex.body.actAs, [PARTY]);
  assert.deepEqual(ex.body.disclosedContracts, [{ contractId: "d1" }]);
});

test("amuletFromEnv derives the scan-proxy from the ledger host", () => {
  const a = amuletFromEnv({
    SELKIE_CBTC_LEDGER: "https://ledger-api-json.participant.hackcanton-01.devnet.naas.noders.services",
    SELKIE_CBTC_TOKEN_URL: "https://kc/token",
    SELKIE_CBTC_CLIENT_ID: "client",
    SELKIE_CBTC_USERNAME: "u",
    SELKIE_CBTC_PASSWORD: "p",
    SELKIE_CBTC_PARTY: "op::1220",
  });
  assert.equal(
    a.scanProxyUrl,
    "https://validator-api-http.validator.hackcanton-01.devnet.naas.noders.services/api/validator/v0/scan-proxy",
  );
});

test("amuletFromEnv is null when devnet auth is absent", () => {
  assert.equal(amuletFromEnv({}), null);
});
