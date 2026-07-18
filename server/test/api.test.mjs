// The web API driven over real HTTP against a real ledger. Nothing stubbed:
// every balance asserted here came out of a Canton contract.

import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { Ledger } from "../../bot/src/ledger.mjs";
import { Wallet } from "../../bot/src/wallet.mjs";
import { History } from "../src/history.mjs";
import { createApp } from "../src/app.mjs";

const JSON_API = process.env.SELKIE_JSON_API ?? "http://localhost:7575";
const PKG = process.env.SELKIE_PKG_ID ?? "d50d0ef1da9ba9cb54c7b72901f4f5abfb628cdd5cc6e6bf98c918ad0e027407";

const reachable = await fetch(`${JSON_API}/readyz`)
  .then((r) => r.ok)
  .catch(() => false);

const run = Date.now().toString(36).slice(-5);
const name = (who) => `${who}${run}`;

describe("web API", { skip: reachable ? false : "no JSON API on " + JSON_API }, () => {
  let server, base, wallet, historyPath;

  before(async () => {
    const ledger = new Ledger({
      baseUrl: JSON_API,
      secret: process.env.SELKIE_JWT_SECRET ?? "secret",
      ledgerId: process.env.SELKIE_LEDGER_ID ?? "sandbox",
      pkgId: PKG,
    });
    const operator = await ledger.allocateParty(`selkie-web-${run}`);
    wallet = new Wallet({ ledger, operator: operator.identifier });
    historyPath = join(tmpdir(), `selkie-history-${run}.jsonl`);

    server = createApp({
      wallet,
      history: new History(historyPath),
      config: {
        sessionSecret: "test-secret",
        secureCookies: false,
        devLogin: true,
        webRoot: null,
        x: { clientId: "", clientSecret: "", redirectUri: "" },
      },
    });
    await new Promise((r) => server.listen(0, r));
    base = `http://localhost:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await rm(historyPath, { force: true });
  });

  /** Sign in and keep the cookie, like a browser would. */
  const signIn = async (handle) => {
    const res = await fetch(`${base}/auth/dev?handle=${handle}`, { redirect: "manual" });
    assert.equal(res.status, 302);
    const cookie = res.headers.getSetCookie()[0].split(";")[0];
    return (path, init = {}) =>
      fetch(`${base}${path}`, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
  };

  test("the API is closed to anyone without a session", async () => {
    for (const path of ["/api/me", "/api/balance", "/api/history"]) {
      assert.equal((await fetch(`${base}${path}`)).status, 401, path);
    }
    const res = await fetch(`${base}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "@victim", asset: "CC", amount: 1 }),
    });
    assert.equal(res.status, 401);
  });

  test("a forged session cookie is refused", async () => {
    const res = await fetch(`${base}/api/me`, {
      headers: { cookie: "selkie_session=eyJoYW5kbGUiOiJAYWRhIn0.not-a-real-signature" },
    });
    assert.equal(res.status, 401);
  });

  test("signing in claims a wallet for the handle", async () => {
    const api = await signIn(name("ada"));
    const me = await (await api("/api/me")).json();
    assert.equal(me.handle, `@${name("ada")}`);
    assert.equal(me.walletReady, true);
    assert.deepEqual(me.assets, ["CC", "USDCX", "CBTC", "CETH"]);
  });

  test("balance reports every supported asset, zeros included", async () => {
    const api = await signIn(name("ada"));
    const { balances } = await (await api("/api/balance")).json();
    assert.deepEqual(balances, { CC: 0, USDCX: 0, CBTC: 0, CETH: 0 });
  });

  test("sending moves real funds and onboards the recipient", async () => {
    await wallet.deposit(name("ada"), "USDCX", 40);
    const api = await signIn(name("ada"));

    const res = await api("/api/send", {
      method: "POST",
      body: JSON.stringify({ to: name("bayo"), asset: "USDCX", amount: 12.5, memo: "design work" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.onboarded, true);
    assert.equal(body.to, `@${name("bayo")}`);

    const mine = await (await api("/api/balance")).json();
    assert.equal(mine.balances.USDCX, 27.5);

    const theirs = await wallet.balance(name("bayo"));
    assert.deepEqual(theirs, { USDCX: 12.5 });
  });

  test("the recipient sees the payment in their history", async () => {
    const api = await signIn(name("bayo"));
    const { entries } = await (await api("/api/history")).json();
    assert.equal(entries.length, 1);
    assert.equal(entries[0].direction, "in");
    assert.equal(entries[0].amount, 12.5);
    assert.equal(entries[0].memo, "design work");
  });

  test("bad sends are refused with a readable reason", async () => {
    const api = await signIn(name("ada"));
    const cases = [
      [{ to: "", asset: "CC", amount: 1 }, /sending to/i],
      [{ to: "@x", asset: "DOGE", amount: 1 }, /unknown asset/i],
      [{ to: "@x", asset: "CC", amount: -5 }, /positive/i],
      [{ to: "@x", asset: "CC", amount: 999 }, /insufficient/i],
    ];
    for (const [payload, pattern] of cases) {
      const res = await api("/api/send", { method: "POST", body: JSON.stringify(payload) });
      assert.equal(res.status, 400, JSON.stringify(payload));
      assert.match((await res.json()).error, pattern);
    }
  });

  test("a campaign pays 20 walletless winners through the API", async () => {
    await wallet.deposit(name("dara"), "CC", 200);
    const api = await signIn(name("dara"));
    const winners = Array.from({ length: 20 }, (_, i) => `${name("fan")}_${i}`);

    const res = await api("/api/campaign", {
      method: "POST",
      body: JSON.stringify({ winners, asset: "CC", amountEach: 5, memo: "meme contest" }),
    });
    const body = await res.json();

    assert.equal(body.paid, 20);
    assert.equal(body.onboarded, 20);
    assert.deepEqual(body.failed, []);
    assert.deepEqual(await wallet.balance(winners[3]), { CC: 5 });
    assert.equal((await (await api("/api/balance")).json()).balances.CC, 100);
  });

  test("static serving cannot be walked out of the web root", async () => {
    const res = await fetch(`${base}/../../../etc/passwd`);
    assert.notEqual(res.status, 200);
  });
});
