// Dispatch replies, tested against a stub wallet — no ledger needed.
// Replies are Telegram HTML now, so we compare on the visible text: strip()
// removes the tags and asserts on what a human actually reads.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand } from "../src/dispatch.mjs";

const strip = (s) => (s == null ? s : s.replace(/<[^>]+>/g, ""));

const stub = (overrides = {}) => ({
  ensureAccount: async () => ({ cid: "c", owner: "p", handle: "@ada", created: false }),
  balance: async () => ({ CBTC: 0.75, USDCX: 3 }),
  send: async ({ to, asset, amount }) => ({
    from: "@ada",
    to: `@${to}`,
    asset,
    amount: Number(amount),
    onboarded: false,
  }),
  ...overrides,
});

const reply = (text, wallet = stub(), history = null) =>
  handleCommand({ wallet, from: "@ada", text, history });

// A fake activity log that records what it was told to append.
const recorder = (rows = []) => ({
  rows,
  append: async (e) => {
    rows.push(e);
    return e;
  },
  forHandle: async () => rows,
});

describe("dispatch", () => {
  test("ignores messages that aren't commands", async () => {
    assert.equal(await reply("gm everyone"), null);
  });

  test("reports balance with a privacy note", async () => {
    const out = strip(await reply("balance"));
    assert.match(out, /0\.75 cBTC/);
    assert.match(out, /3 USDCX/);
    assert.match(out, /Only you and the sender can see this/);
  });

  test("empty wallet gets a nudge, not a zero list", async () => {
    const out = await reply("balance", stub({ balance: async () => ({}) }));
    assert.match(out, /empty/i);
  });

  test("confirms a send", async () => {
    const out = strip(await reply("send 5 USDCX to @bayo"));
    assert.match(out, /Sent 5 USDCX to @bayo/);
  });

  test("calls out auto-onboarding when the recipient was new", async () => {
    const wallet = stub({
      send: async () => ({ from: "@ada", to: "@newbie", asset: "CC", amount: 2, onboarded: true }),
    });
    const out = strip(await reply("send 2 CC to @newbie", wallet));
    assert.match(out, /had no wallet/i);
    assert.match(out, /money is already theirs/i);
  });

  test("a send is logged to history as an outgoing entry", async () => {
    const log = recorder();
    await reply("send 5 CC to @bayo for lunch", stub(), log);
    assert.equal(log.rows.length, 1);
    assert.deepEqual(log.rows[0], {
      type: "send",
      from: "@ada",
      to: "@bayo",
      asset: "CC",
      amount: 5,
      memo: "for lunch",
    });
  });

  test("history renders grouped, newest-first, with clean asset labels", async () => {
    const log = {
      append: async () => {},
      forHandle: async () => [
        { ts: new Date().toISOString(), direction: "out", amount: 5, asset: "CC", to: "@bayo", from: "@ada", memo: "lunch" },
        { ts: new Date().toISOString(), direction: "in", amount: 0.1, asset: "CBTC", to: "@ada", from: "@sam", memo: "request" },
      ],
    };
    const out = strip(await reply("history", stub(), log));
    assert.match(out, /Your activity/);
    assert.match(out, /Today/);
    assert.match(out, /5 CC to @bayo · lunch/);
    assert.match(out, /0\.1 cBTC from @sam/);
    assert.doesNotMatch(out, /· request/, "the internal 'request' memo tag is not shown");
  });

  test("empty history reads as empty, not broken", async () => {
    const out = strip(await reply("history", stub(), recorder()));
    assert.match(out, /Nothing yet/i);
  });

  test("history without a store says so instead of throwing", async () => {
    assert.match(await reply("history"), /isn't available/i);
  });

  test("asking for money says plainly that nothing has moved", async () => {
    const wallet = stub({
      requestPayment: async ({ asset, amount }) => ({
        from: "@ada",
        to: "@chidi",
        asset,
        amount: Number(amount),
        onboarded: false,
      }),
    });
    const out = strip(await reply("request 10 CC from @chidi", wallet));
    assert.match(out, /Asked @chidi for 10 CC/);
    assert.match(out, /Nothing moves until they do/i);
  });

  test("lists who is waiting on you and how to answer", async () => {
    const wallet = stub({
      requests: async () => ({
        incoming: [{ cid: "r1", from: "@mira", to: "@ada", asset: "CC", amount: 10, memo: "lunch" }],
        outgoing: [],
      }),
    });
    const out = strip(await reply("requests", wallet));
    assert.match(out, /@mira asked for 10 CC · lunch/);
    assert.match(out, /approve @handle/);
  });

  test("approving the only open request pays it and logs it", async () => {
    let paid = null;
    const log = recorder();
    const wallet = stub({
      requests: async () => ({
        incoming: [{ cid: "r1", from: "@mira", to: "@ada", asset: "CC", amount: 10, memo: "" }],
        outgoing: [],
      }),
      approveRequest: async (args) => {
        paid = args;
        return { from: "@ada", to: "@mira", asset: "CC", amount: 10 };
      },
    });
    const out = strip(await reply("approve", wallet, log));
    assert.equal(paid.cid, "r1", "approved the open request without being told which");
    assert.match(out, /Paid @mira 10 CC/);
    assert.equal(log.rows.length, 1);
    assert.equal(log.rows[0].type, "payment");
    assert.equal(log.rows[0].to, "@mira");
  });

  test("declining moves no money and says so", async () => {
    const wallet = stub({
      requests: async () => ({
        incoming: [{ cid: "r1", from: "@mira", to: "@ada", asset: "CC", amount: 10, memo: "" }],
        outgoing: [],
      }),
      declineRequest: async () => ({ asset: "CC", amount: 10 }),
    });
    assert.match(strip(await reply("decline @mira", wallet)), /No money moved/i);
  });

  test("two open requests force you to name one", async () => {
    const wallet = stub({
      requests: async () => ({
        incoming: [
          { cid: "r1", from: "@mira", to: "@ada", asset: "CC", amount: 10, memo: "" },
          { cid: "r2", from: "@theo", to: "@ada", asset: "CC", amount: 4, memo: "" },
        ],
        outgoing: [],
      }),
      approveRequest: async () => assert.fail("must not guess which request to pay"),
    });
    const out = strip(await reply("approve", wallet));
    assert.match(out, /more than one open request/i);
    assert.match(out, /@mira, @theo/);
  });

  test("rejects unknown assets before touching the ledger", async () => {
    const wallet = stub({
      send: async () => assert.fail("should not reach the ledger"),
    });
    const out = await reply("send 5 DOGE to @bayo", wallet);
    assert.match(out, /unknown asset/i);
  });

  test("explains insufficient funds in plain language", async () => {
    const wallet = stub({
      send: async () => {
        const e = new Error("insufficient CBTC: has 0.75, needs 99");
        e.code = "INSUFFICIENT_FUNDS";
        throw e;
      },
    });
    assert.match(await reply("send 99 CBTC to @bayo", wallet), /Not enough funds/);
  });

  test("tells a walletless sender how to get started", async () => {
    const wallet = stub({
      send: async () => {
        const e = new Error("no wallet");
        e.code = "NO_SENDER_WALLET";
        throw e;
      },
    });
    assert.match(strip(await reply("send 1 CC to @bayo", wallet)), /don't have a Selkie wallet/);
  });

  test("surfaces ledger errors without leaking a stack trace", async () => {
    const wallet = stub({
      send: async () => {
        throw new Error("DAML_AUTHORIZATION_ERROR");
      },
    });
    const out = await reply("send 1 CC to @bayo", wallet);
    assert.match(out, /didn't go through/);
    assert.doesNotMatch(out, /\n\s+at .+:\d+/, "no stack frames in user-facing text");
    assert.doesNotMatch(out, /\.mjs/, "no file paths in user-facing text");
  });
});
