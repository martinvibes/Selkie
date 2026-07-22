// The /api/reserve HTTP contract. The reserve client itself talks to the real
// devnet participant and is exercised live by bot/scripts/cbtc.mjs; here we
// pin down what the endpoint promises the web app: shape, caching, and that a
// deployment without a reserve says so instead of failing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.mjs";

const config = {
  sessionSecret: "test-secret",
  secureCookies: false,
  devLogin: false,
  webRoot: null,
  x: { clientId: "", clientSecret: "", redirectUri: "" },
};

const listen = (app) =>
  new Promise((resolve) => {
    app.listen(0, () => resolve(`http://localhost:${app.address().port}`));
  });

test("reserve: a deployment without one says inactive, not error", async () => {
  const app = createApp({ wallet: {}, config, history: {} });
  const base = await listen(app);
  const res = await fetch(`${base}/api/reserve`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { active: false });
  app.close();
});

test("reserve: reports holdings and caches the ledger read", async () => {
  let reads = 0;
  const cbtc = {
    instrument: "CBTC",
    party: "operator::1220abc",
    holdings: async () => {
      reads += 1;
      return {
        total: 2,
        unlocked: 1.9,
        contracts: [
          { cid: "00aa", amount: 1.9, locked: false },
          { cid: "00bb", amount: 0.1, locked: true },
        ],
      };
    },
  };
  const app = createApp({ wallet: {}, config, history: {}, cbtc });
  const base = await listen(app);

  const body = await (await fetch(`${base}/api/reserve`)).json();
  assert.equal(body.active, true);
  assert.equal(body.instrument, "CBTC");
  assert.equal(body.total, 2);
  assert.equal(body.unlocked, 1.9);
  assert.equal(body.contracts.length, 2);
  assert.ok(body.asOf);

  await fetch(`${base}/api/reserve`);
  assert.equal(reads, 1, "second request within 30s must be served from cache");
  app.close();
});

test("reserve: a failing ledger read is a 503, not a fake zero", async () => {
  const cbtc = {
    instrument: "CBTC",
    party: "operator::1220abc",
    holdings: async () => {
      throw new Error("participant unreachable");
    },
  };
  const app = createApp({ wallet: {}, config, history: {}, cbtc });
  const base = await listen(app);
  const res = await fetch(`${base}/api/reserve`);
  assert.equal(res.status, 503);
  assert.match((await res.json()).error, /participant unreachable/);
  app.close();
});
