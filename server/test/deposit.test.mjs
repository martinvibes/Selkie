// The deposit + reserve HTTP contract. The token clients themselves are
// exercised against devnet by bot/scripts; what matters here is the rule each
// endpoint enforces now that every token lands at the handle's OWN party: your
// deposit address is personal, a claim accepts whatever waits there across every
// token, and your reserve is the real on-ledger backing at that same address.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";
import { normalizeHandle } from "../../bot/src/wallet.mjs";

// Each handle owns a distinct Canton party, the same way the pool assigns them.
const partyFor = (h) => `pool-${normalizeHandle(h).replace(/^@/, "")}::1220party`;

const makeWallet = (extra = {}) => ({
  ensureAccount: async (handle) => ({ owner: partyFor(handle), handle: normalizeHandle(handle), created: false }),
  findAccount: async (handle) => ({ owner: partyFor(handle), handle: normalizeHandle(handle) }),
  ...extra,
});

// A stand-in for a TokenParty: pending/holdings keyed by party, accepts recorded.
function fakeToken({ asset = "CBTC", label = "cBTC", pending = {}, holdings = {} } = {}) {
  const accepted = [];
  return {
    asset,
    label,
    accepted,
    pendingFor: async (party) => pending[party] ?? [],
    acceptFor: async (party, cid) => {
      accepted.push({ party, cid });
      return { cid, updateId: `up-${cid}` };
    },
    holdingsFor: async (party) => holdings[party] ?? 0,
  };
}

const config = {
  sessionSecret: "test-secret",
  secureCookies: false,
  devLogin: true,
  webRoot: null,
  x: { clientId: "", clientSecret: "", redirectUri: "" },
};

const listen = (app) =>
  new Promise((resolve) => {
    app.listen(0, () => resolve(`http://localhost:${app.address().port}`));
  });

const signIn = async (base, handle) => {
  const res = await fetch(`${base}/auth/dev?handle=${handle}`, { redirect: "manual" });
  const cookie = res.headers.getSetCookie()[0].split(";")[0];
  return (path, init = {}) =>
    fetch(`${base}${path}`, {
      ...init,
      headers: { cookie, "content-type": "application/json", ...init.headers },
    });
};

test("deposit: an instance without a devnet connection says so", async () => {
  const app = createApp({ wallet: makeWallet(), config, history: {}, tokens: [] });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  assert.deepEqual(await (await api("/api/deposit")).json(), { active: false });
  app.close();
});

test("deposit: each handle receives at its own party, with its own pending", async () => {
  const adaParty = partyFor("@ada");
  const cc = fakeToken({ asset: "CC" });
  const cbtc = fakeToken({
    asset: "CBTC",
    pending: { [adaParty]: [{ cid: "c1", sender: "faucet::1220", amount: 0.5 }] },
  });
  const app = createApp({ wallet: makeWallet(), config, history: {}, tokens: [cc, cbtc] });
  const base = await listen(app);

  const ada = await (await (await signIn(base, "ada"))("/api/deposit")).json();
  const bayo = await (await (await signIn(base, "bayo"))("/api/deposit")).json();

  assert.notEqual(ada.address, bayo.address, "each handle has its own address");
  assert.equal(ada.address, adaParty);
  assert.deepEqual(ada.assets, ["CC", "CBTC"], "one address receives both tokens");
  assert.deepEqual(ada.pending, [{ asset: "CBTC", amount: 0.5, sender: "faucet::1220" }]);
  assert.deepEqual(bayo.pending, [], "bayo has nothing waiting at its own party");
  app.close();
});

test("deposit: claim accepts what's waiting at your party across every token", async () => {
  const adaParty = partyFor("@ada");
  const credited = [];
  const cc = fakeToken({ asset: "CC", pending: { [adaParty]: [{ cid: "cc1", sender: "s1", amount: 5 }] } });
  const cbtc = fakeToken({ asset: "CBTC", pending: { [adaParty]: [{ cid: "bt1", sender: "s2", amount: 0.5 }] } });
  const wallet = makeWallet({
    deposit: async (handle, asset, amount) => credited.push({ handle, asset, amount }),
  });
  const history = { append: async (e) => ({ id: `h-${e.asset}`, ...e }) };

  const app = createApp({ wallet, config, history, tokens: [cc, cbtc] });
  const base = await listen(app);
  const api = await signIn(base, "ada");

  const body = await (await api("/api/deposit/claim", { method: "POST" })).json();

  assert.deepEqual(cc.accepted, [{ party: adaParty, cid: "cc1" }]);
  assert.deepEqual(cbtc.accepted, [{ party: adaParty, cid: "bt1" }]);
  assert.deepEqual(credited, [
    { handle: "@ada", asset: "CC", amount: 5 },
    { handle: "@ada", asset: "CBTC", amount: 0.5 },
  ]);
  assert.equal(body.total, 5.5);
  assert.equal(body.claimed.length, 2);
  app.close();
});

test("deposit: a claim is logged as real inbound activity", async () => {
  const adaParty = partyFor("@ada");
  const logged = [];
  const cbtc = fakeToken({
    asset: "CBTC",
    label: "cBTC",
    pending: { [adaParty]: [{ cid: "00a", sender: "faucet::1220f", amount: 0.25 }] },
  });
  const app = createApp({
    wallet: makeWallet({ deposit: async () => {} }),
    config,
    history: {
      append: async (entry) => {
        logged.push(entry);
        return { id: "h1", ...entry };
      },
    },
    tokens: [cbtc],
  });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  await api("/api/deposit/claim", { method: "POST" });

  assert.equal(logged.length, 1);
  assert.equal(logged[0].type, "deposit");
  assert.equal(logged[0].to, "@ada");
  assert.equal(logged[0].from, "faucet::1220f");
  assert.equal(logged[0].amount, 0.25);
  assert.match(logged[0].memo, /cBTC/);
  app.close();
});

test("deposit: an unreachable ledger is an error, not an empty result", async () => {
  const cbtc = {
    asset: "CBTC",
    label: "cBTC",
    pendingFor: async () => {
      throw new Error("participant unreachable");
    },
    acceptFor: async () => ({}),
    holdingsFor: async () => 0,
  };
  const app = createApp({ wallet: makeWallet({ deposit: async () => {} }), config, history: {}, tokens: [cbtc] });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  const res = await api("/api/deposit/claim", { method: "POST" });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /participant unreachable/);
  app.close();
});

test("deposit: deposit and claim are closed without a session", async () => {
  const app = createApp({ wallet: makeWallet(), config, history: {}, tokens: [fakeToken()] });
  const base = await listen(app);
  assert.equal((await fetch(`${base}/api/deposit`)).status, 401);
  assert.equal((await fetch(`${base}/api/deposit/claim`, { method: "POST" })).status, 401);
  app.close();
});

test("reserve: shows your own on-ledger backing, per token", async () => {
  const adaParty = partyFor("@ada");
  const cc = fakeToken({ asset: "CC", holdings: { [adaParty]: 92 } });
  const cbtc = fakeToken({ asset: "CBTC", holdings: { [adaParty]: 0.5 } });
  const app = createApp({ wallet: makeWallet(), config, history: {}, tokens: [cc, cbtc] });
  const base = await listen(app);
  const api = await signIn(base, "ada");

  const r = await (await api("/api/reserve")).json();
  assert.equal(r.active, true);
  assert.equal(r.address, adaParty);
  assert.equal(r.network, "Canton devnet");
  assert.deepEqual(r.holdings, [
    { asset: "CC", amount: 92 },
    { asset: "CBTC", amount: 0.5 },
  ]);
  app.close();
});

test("reserve: closed without a session, and off when no tokens are configured", async () => {
  const app = createApp({ wallet: makeWallet(), config, history: {}, tokens: [] });
  const base = await listen(app);
  assert.equal((await fetch(`${base}/api/reserve`)).status, 401);
  const api = await signIn(base, "ada");
  assert.deepEqual(await (await api("/api/reserve")).json(), { active: false });
  app.close();
});
