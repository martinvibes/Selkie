// Dispatch replies, tested against a stub wallet — no ledger needed.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { handleCommand } from "../src/dispatch.mjs";

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

const reply = (text, wallet = stub()) => handleCommand({ wallet, from: "@ada", text });

describe("dispatch", () => {
  test("ignores messages that aren't commands", async () => {
    assert.equal(await reply("gm everyone"), null);
  });

  test("reports balance with a privacy note", async () => {
    const out = await reply("balance");
    assert.match(out, /0\.75 CBTC/);
    assert.match(out, /3 USDCX/);
    assert.match(out, /Only you and the sender can see this/);
  });

  test("empty wallet gets a nudge, not a zero list", async () => {
    const out = await reply("balance", stub({ balance: async () => ({}) }));
    assert.match(out, /empty/i);
  });

  test("confirms a send", async () => {
    const out = await reply("send 5 USDCX to @bayo");
    assert.match(out, /Sent 5 USDCX to @bayo/);
  });

  test("calls out auto-onboarding when the recipient was new", async () => {
    const wallet = stub({
      send: async () => ({ from: "@ada", to: "@newbie", asset: "CC", amount: 2, onboarded: true }),
    });
    const out = await reply("send 2 CC to @newbie", wallet);
    assert.match(out, /had no wallet/i);
    assert.match(out, /already have the money/i);
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
    const out = await reply("request 10 CC from @chidi", wallet);
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
    const out = await reply("requests", wallet);
    assert.match(out, /@mira asked for 10 CC for lunch/);
    assert.match(out, /approve @handle/);
  });

  test("approving the only open request pays it", async () => {
    let paid = null;
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
    const out = await reply("approve", wallet);
    assert.equal(paid.cid, "r1", "approved the open request without being told which");
    assert.match(out, /Paid @mira 10 CC/);
  });

  test("declining moves no money and says so", async () => {
    const wallet = stub({
      requests: async () => ({
        incoming: [{ cid: "r1", from: "@mira", to: "@ada", asset: "CC", amount: 10, memo: "" }],
        outgoing: [],
      }),
      declineRequest: async () => ({ asset: "CC", amount: 10 }),
    });
    assert.match(await reply("decline @mira", wallet), /No money moved/i);
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
    const out = await reply("approve", wallet);
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
    assert.match(await reply("send 1 CC to @bayo", wallet), /don't have a Selkie wallet/);
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
