// The deposit HTTP contract. The cBTC client itself is exercised live against
// devnet by bot/scripts/cbtc.mjs; what matters here is the rule the endpoint
// enforces, because Selkie receives every deposit at ONE party: a transfer is
// yours only if it names your handle, and an unnamed transfer is nobody's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";

const account = async () => ({ cid: "c", owner: "p", handle: "@x", created: false });

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
  const app = createApp({ wallet: { ensureAccount: account }, config, history: {} });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  assert.deepEqual(await (await api("/api/deposit")).json(), { active: false });
  app.close();
});

test("deposit: the address is shared and the tag is what makes it yours", async () => {
  const cbtc = { instrument: "CBTC", party: "selkie-operator::1220abc", pending: async () => [] };
  const app = createApp({ wallet: { ensureAccount: account }, config, history: {}, cbtc });
  const base = await listen(app);

  const ada = await (await (await signIn(base, "ada"))("/api/deposit")).json();
  const bayo = await (await (await signIn(base, "bayo"))("/api/deposit")).json();

  assert.equal(ada.address, bayo.address, "one party receives for everybody");
  assert.equal(ada.tag, "@ada");
  assert.equal(bayo.tag, "@bayo");
  assert.equal(ada.tagKey, "selkie.handle");
  app.close();
});

test("deposit: claims only what names you, and never sweeps the rest", async () => {
  const accepted = [];
  const credited = [];
  const cbtc = {
    instrument: "CBTC",
    party: "selkie-operator::1220abc",
    pending: async () => [
      { cid: "00mine", sender: "faucet::1220f", amount: 0.5, handle: "@ada" },
      { cid: "00theirs", sender: "faucet::1220f", amount: 9, handle: "@bayo" },
      { cid: "00nobody", sender: "faucet::1220f", amount: 4, handle: null },
    ],
    accept: async (cid) => {
      accepted.push(cid);
      return { cid, updateId: `1220${cid}` };
    },
  };
  const wallet = {
    ensureAccount: account,
    deposit: async (handle, asset, amount) => {
      credited.push({ handle, asset, amount });
    },
  };
  const history = { append: async (entry) => ({ id: "h1", ...entry }) };

  const app = createApp({ wallet, config, history, cbtc });
  const base = await listen(app);
  const api = await signIn(base, "ada");

  const body = await (await api("/api/deposit/claim", { method: "POST" })).json();

  assert.deepEqual(accepted, ["00mine"], "only the transfer tagged for @ada was accepted");
  assert.deepEqual(credited, [{ handle: "@ada", asset: "CBTC", amount: 0.5 }]);
  assert.equal(body.total, 0.5);
  assert.equal(body.claimed.length, 1);
  assert.equal(body.unattributed, 1, "the untagged transfer is reported, not taken");
  app.close();
});

test("deposit: only the operator can take an untagged transfer", async () => {
  const untagged = [{ cid: "00nobody", sender: "faucet::1220f", amount: 4, handle: null }];
  const build = (accepted) =>
    createApp({
      wallet: { ensureAccount: account, deposit: async () => {} },
      config: { ...config, operatorHandle: "martinvibes" },
      history: { append: async (e) => ({ id: "h1", ...e }) },
      cbtc: {
        instrument: "CBTC",
        party: "selkie-operator::1220abc",
        pending: async () => untagged,
        accept: async (cid) => {
          accepted.push(cid);
          return { cid, updateId: "1220up" };
        },
      },
    });

  // An ordinary user asking for them is simply ignored.
  const takenByUser = [];
  const userApp = build(takenByUser);
  const userBase = await listen(userApp);
  const user = await signIn(userBase, "ada");
  const denied = await (
    await user("/api/deposit/claim", { method: "POST", body: JSON.stringify({ includeUntagged: true }) })
  ).json();
  assert.deepEqual(takenByUser, [], "a stranger cannot sweep money that named nobody");
  assert.equal(denied.unattributed, 1, "it stays visible and unclaimed");
  assert.equal((await (await user("/api/deposit")).json()).isOperator, false);
  userApp.close();

  const takenByOperator = [];
  const opApp = build(takenByOperator);
  const opBase = await listen(opApp);
  const op = await signIn(opBase, "martinvibes");
  const swept = await (
    await op("/api/deposit/claim", { method: "POST", body: JSON.stringify({ includeUntagged: true }) })
  ).json();
  assert.deepEqual(takenByOperator, ["00nobody"]);
  assert.equal(swept.total, 4);
  assert.equal((await (await op("/api/deposit")).json()).isOperator, true);
  opApp.close();
});

test("deposit: a claim is logged as real inbound activity", async () => {
  const logged = [];
  const cbtc = {
    instrument: "CBTC",
    party: "selkie-operator::1220abc",
    pending: async () => [{ cid: "00a", sender: "faucet::1220f", amount: 0.25, handle: "@ada" }],
    accept: async (cid) => ({ cid, updateId: "1220up" }),
  };
  const app = createApp({
    wallet: { ensureAccount: account, deposit: async () => {} },
    config,
    history: {
      append: async (entry) => {
        logged.push(entry);
        return { id: "h1", ...entry };
      },
    },
    cbtc,
  });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  await api("/api/deposit/claim", { method: "POST" });

  assert.equal(logged.length, 1);
  assert.equal(logged[0].type, "deposit");
  assert.equal(logged[0].to, "@ada");
  assert.equal(logged[0].from, "faucet::1220f");
  assert.equal(logged[0].amount, 0.25);
  app.close();
});

test("deposit: an unreachable ledger is an error, not an empty result", async () => {
  const cbtc = {
    instrument: "CBTC",
    party: "selkie-operator::1220abc",
    pending: async () => {
      throw new Error("participant unreachable");
    },
  };
  const app = createApp({ wallet: { ensureAccount: account }, config, history: {}, cbtc });
  const base = await listen(app);
  const api = await signIn(base, "ada");
  const res = await api("/api/deposit/claim", { method: "POST" });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /participant unreachable/);
  app.close();
});

test("deposit: both routes are closed without a session", async () => {
  const cbtc = { instrument: "CBTC", party: "p::1220a", pending: async () => [] };
  const app = createApp({ wallet: { ensureAccount: account }, config, history: {}, cbtc });
  const base = await listen(app);
  assert.equal((await fetch(`${base}/api/deposit`)).status, 401);
  assert.equal((await fetch(`${base}/api/deposit/claim`, { method: "POST" })).status, 401);
  app.close();
});
