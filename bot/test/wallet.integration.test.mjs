// End-to-end against real Canton 3.x: social commands -> real Canton contracts.
// Skipped automatically when no ledger is running (so `npm test` stays green
// on a clean checkout). To run it against LocalNet's app-provider participant:
//
//   cd ~/.pg/splice-node/docker-compose/localnet && \
//     docker compose --profile sv --profile app-provider --profile app-user up -d
//   SELKIE_PKG_ID=<selkie pkg id> npm test
//
// The defaults below match LocalNet's unsafe-jwt-hmac-256 auth; override with
// SELKIE_JSON_API / SELKIE_JWT_SECRET / SELKIE_AUTH_AUDIENCE for another node.

import { test, before, describe } from "node:test";
import assert from "node:assert/strict";
import { Ledger } from "../src/ledger.mjs";
import { Wallet } from "../src/wallet.mjs";

const BASE = process.env.SELKIE_JSON_API ?? "http://localhost:3975";
const PKG = process.env.SELKIE_PKG_ID ?? "49a123170adb07f7fee0ee70d30395d1a40336be53a7228cd4d1b1df50ed5f83";

// A response of any status means the participant is up; fetch only rejects on a
// network error, so a 401 here still counts as reachable.
const reachable = await fetch(`${BASE}/v2/version`)
  .then(() => true)
  .catch(() => false);

// Unique per run so repeated runs don't collide on already-registered handles.
const run = Date.now().toString(36).slice(-5);
const h = (name) => `@${name}${run}`;

describe("wallet on a live ledger", { skip: reachable ? false : "no JSON API on " + BASE }, () => {
  let wallet;

  before(async () => {
    const ledger = new Ledger({
      baseUrl: BASE,
      secret: process.env.SELKIE_JWT_SECRET ?? "unsafe",
      userId: process.env.SELKIE_LEDGER_USER ?? "ledger-api-user",
      audience: process.env.SELKIE_AUTH_AUDIENCE ?? "https://canton.network.global",
      pkgId: PKG,
    });
    // On a node we run, the operator is allocated and self-granted actAs; a
    // shared node's operator does the grant for us instead.
    const operator = await ledger.allocateParty(`selkie-operator-${run}`);
    await ledger.grantActAs(operator.identifier);
    wallet = new Wallet({ ledger, operator: operator.identifier });
  });

  test("deposit creates a wallet for a brand-new handle", async () => {
    const ada = h("ada");
    assert.equal(await wallet.findAccount(ada), null);

    await wallet.deposit(ada, "CBTC", 1.0);

    const acc = await wallet.findAccount(ada);
    assert.ok(acc, "account exists after deposit");
    assert.deepEqual(await wallet.balance(ada), { CBTC: 1.0 });
  });

  test("sending to a stranger onboards them mid-payment", async () => {
    const ada = h("ada");
    const bayo = h("bayo");
    assert.equal(await wallet.findAccount(bayo), null, "bayo starts with no wallet");

    const res = await wallet.send({ from: ada, to: bayo, asset: "CBTC", amount: 0.25, memo: "coffee" });

    assert.equal(res.onboarded, true, "recipient wallet was created by the payment");
    assert.deepEqual(await wallet.balance(bayo), { CBTC: 0.25 });
    assert.deepEqual(await wallet.balance(ada), { CBTC: 0.75 });
  });

  test("handles are case- and @-insensitive", async () => {
    const bayo = h("bayo");
    const shouted = bayo.toUpperCase().replace("@", "");
    assert.deepEqual(await wallet.balance(shouted), { CBTC: 0.25 });
  });

  test("payments spanning fragmented change still settle", async () => {
    const ada = h("ada");
    // Three small deposits + existing change = several holdings, one payment.
    await wallet.deposit(ada, "USDCX", 5);
    await wallet.deposit(ada, "USDCX", 5);
    await wallet.deposit(ada, "USDCX", 5);
    assert.deepEqual(await wallet.balance(ada), { CBTC: 0.75, USDCX: 15 });

    await wallet.send({ from: ada, to: h("cid"), asset: "USDCX", amount: 12 });

    assert.deepEqual(await wallet.balance(h("cid")), { USDCX: 12 });
    assert.equal((await wallet.balance(ada)).USDCX, 3);
  });

  test("overspending is refused by the ledger", async () => {
    await assert.rejects(
      () => wallet.send({ from: h("bayo"), to: h("ada"), asset: "CBTC", amount: 99 }),
      /insufficient/i,
    );
  });

  test("a stranger cannot send money they don't have", async () => {
    await assert.rejects(
      () => wallet.send({ from: h("nobody"), to: h("ada"), asset: "CC", amount: 1 }),
      /no Selkie wallet/i,
    );
  });

  test("onboarding recovers when the party already exists", async () => {
    // Simulates a crash between allocating a party and creating the account:
    // the retry must reuse the party, not lock the handle out of being paid.
    const hint = `selkie-x-orphan${run}`;
    const first = await wallet.ensureParty(hint);
    const second = await wallet.ensureParty(hint);
    assert.equal(second, first, "same party is reused, not re-allocated");
  });

  test("a request settles only when the payer approves it", async () => {
    const mira = h("mira");
    const theo = h("theo");
    await wallet.deposit(theo, "USDCX", 30);

    const req = await wallet.requestPayment({
      from: mira,
      to: theo,
      asset: "USDCX",
      amount: 12,
      memo: "lunch",
    });

    // Asking for money must not move any.
    assert.equal((await wallet.balance(theo)).USDCX, 30, "payer untouched until they approve");
    assert.equal((await wallet.balance(mira)).USDCX, undefined, "requester not paid yet");

    // Each side sees the same request from their own end.
    assert.equal((await wallet.requests(theo)).incoming.length, 1);
    assert.equal((await wallet.requests(mira)).outgoing.length, 1);

    const settled = await wallet.approveRequest({ cid: req.cid, payerHandle: theo });
    assert.equal(settled.amount, 12);
    assert.equal((await wallet.balance(theo)).USDCX, 18, "payer debited");
    assert.equal((await wallet.balance(mira)).USDCX, 12, "requester paid");
    assert.equal((await wallet.requests(theo)).incoming.length, 0, "request is closed");
  });

  test("only the named payer can approve a request", async () => {
    const mira = h("mira2");
    const theo = h("theo2");
    const nosy = h("nosy2");
    await wallet.deposit(theo, "CC", 10);
    await wallet.deposit(nosy, "CC", 10);

    const req = await wallet.requestPayment({ from: mira, to: theo, asset: "CC", amount: 5 });

    await assert.rejects(
      () => wallet.approveRequest({ cid: req.cid, payerHandle: nosy }),
      /not addressed to you/i,
      "a stranger cannot pay someone else's request into existence",
    );
    assert.equal((await wallet.balance(nosy)).CC, 10, "stranger not debited");
  });

  test("declining a request closes it without moving money", async () => {
    const mira = h("mira3");
    const theo = h("theo3");
    await wallet.deposit(theo, "CC", 8);

    const req = await wallet.requestPayment({ from: mira, to: theo, asset: "CC", amount: 3 });
    await wallet.declineRequest({ cid: req.cid, payerHandle: theo });

    assert.equal((await wallet.balance(theo)).CC, 8, "nothing moved");
    assert.equal((await wallet.requests(theo)).incoming.length, 0, "request is gone");
    await assert.rejects(
      () => wallet.approveRequest({ cid: req.cid, payerHandle: theo }),
      /no longer open/i,
    );
  });

  test("you can request from someone who has never used Selkie", async () => {
    const mira = h("mira4");
    const stranger = h("stranger4");
    assert.equal(await wallet.findAccount(stranger), null);

    const req = await wallet.requestPayment({ from: mira, to: stranger, asset: "CC", amount: 4 });
    assert.equal(req.onboarded, true, "their wallet was created by the ask");
    assert.equal((await wallet.requests(stranger)).incoming.length, 1);
  });

  test("reward campaign pays 20 winners, all previously walletless", async () => {
    const dara = h("dara");
    await wallet.deposit(dara, "CC", 100);
    const winners = Array.from({ length: 20 }, (_, i) => h(`winner${i}`));

    const res = await wallet.reward({ from: dara, winners, asset: "CC", amountEach: 2, memo: "quest" });

    assert.equal(res.paid, 20, "every winner got paid");
    assert.equal(res.onboarded, 20, "every winner was new to crypto");
    assert.deepEqual(res.failed, [], "zero unclaimed");
    assert.deepEqual(await wallet.balance(winners[0]), { CC: 2 });
    assert.deepEqual(await wallet.balance(winners[19]), { CC: 2 });
    assert.equal((await wallet.balance(dara)).CC, 60);
  });
});
