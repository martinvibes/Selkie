// Telegram routing: /start, receive, the persistent nav bar, requests and the
// tap-to-pay callback. The Bot API is faked (call() records what would be sent)
// and the wallet is stubbed, so this checks chat-native behaviour without a
// live bot or a ledger.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramBot } from "../src/telegram.mjs";

const stubWallet = (over = {}) => ({
  ensureAccount: async (u) => ({ owner: "selkie-pool-01::1220abcd", handle: `@${u.toLowerCase()}`, created: true }),
  balance: async () => ({ CC: 12 }),
  requests: async () => ({ incoming: [], outgoing: [] }),
  ...over,
});

function makeBot(wallet, history = null) {
  const calls = [];
  const bot = new TelegramBot({ token: "t", wallet, history, log: () => {} });
  bot.call = async (method, body) => {
    calls.push({ method, body });
    return {};
  };
  const sends = () => calls.filter((c) => c.method === "sendMessage");
  return { bot, calls, sends, sent: () => sends()[0] };
}

test("/start opens a wallet and pins the nav bar", async () => {
  const { bot, sent } = makeBot(stubWallet());
  await bot.onUpdate({
    message: { text: "/start", chat: { id: 1, type: "private" }, from: { username: "Bayo" } },
  });
  assert.match(sent().body.text, /Welcome to Selkie, @bayo/);
  assert.equal(sent().body.parse_mode, "HTML");
  assert.ok(sent().body.reply_markup?.keyboard, "the persistent nav bar is attached");
});

test("a returning, already-funded user is told to check their balance", async () => {
  const { bot, sent } = makeBot(
    stubWallet({
      ensureAccount: async (u) => ({ owner: "p", handle: `@${u}`, created: false }),
      balance: async () => ({ CC: 6 }),
    }),
  );
  await bot.onUpdate({
    message: { text: "/start", chat: { id: 1, type: "private" }, from: { username: "vestor" } },
  });
  assert.match(sent().body.text, /balance waiting/i);
});

test("receive offers copy-handle and copy-address buttons", async () => {
  const { bot, sent } = makeBot(stubWallet());
  await bot.onUpdate({
    message: { text: "receive", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  const buttons = sent().body.reply_markup.inline_keyboard.flat();
  const copies = buttons.map((b) => b.copy_text?.text);
  assert.ok(copies.includes("@bayo"), "one button copies the handle");
  assert.ok(copies.some((t) => t?.startsWith("selkie-pool-01")), "one button copies the address");
  // The values are in the body too, so a client without copy buttons still works.
  assert.match(sent().body.text, /selkie-pool-01/);
});

test("a tapped nav button routes like the typed word", async () => {
  const { bot, sent } = makeBot(stubWallet());
  await bot.onUpdate({
    message: { text: "💰 Balance", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  assert.match(sent().body.text, /balance/i);
  assert.ok(sent().body.reply_markup?.keyboard, "nav stays pinned under the reply");
});

test("history opens the activity log", async () => {
  const history = {
    append: async () => {},
    forHandle: async () => [
      { ts: new Date().toISOString(), direction: "out", amount: 5, asset: "CC", to: "@ada", from: "@bayo", memo: "" },
    ],
  };
  const { bot, sent } = makeBot(stubWallet(), history);
  await bot.onUpdate({
    message: { text: "🧾 History", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  assert.match(sent().body.text, /activity/i);
  assert.match(sent().body.text.replace(/<[^>]+>/g, ""), /5 CC to @ada/);
});

test("requests offers a tap-to-pay button per incoming ask", async () => {
  const wallet = stubWallet({
    requests: async () => ({
      incoming: [{ cid: "r1", from: "@mira", to: "@bayo", asset: "CC", amount: 10, memo: "lunch" }],
      outgoing: [],
    }),
  });
  const { bot, sent } = makeBot(wallet);
  await bot.onUpdate({
    message: { text: "requests", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  const buttons = sent().body.reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some((b) => b.callback_data === "approve:mira"), "a Pay button targets the asker");
  assert.ok(buttons.some((b) => b.callback_data === "decline:mira"), "a Decline button too");
});

test("tapping Pay approves that request and answers the callback", async () => {
  let paid = null;
  const wallet = stubWallet({
    requests: async () => ({
      incoming: [{ cid: "r1", from: "@mira", to: "@bayo", asset: "CC", amount: 10, memo: "" }],
      outgoing: [],
    }),
    approveRequest: async (args) => {
      paid = args;
      return { from: "@bayo", to: "@mira", asset: "CC", amount: 10 };
    },
  });
  const { bot, calls } = makeBot(wallet);
  await bot.onUpdate({
    callback_query: { id: "cb1", data: "approve:mira", message: { chat: { id: 1 } }, from: { username: "bayo" } },
  });
  assert.equal(paid?.cid, "r1", "the tapped request was the one paid");
  assert.ok(calls.some((c) => c.method === "sendMessage" && /Paid @mira/.test(c.body.text)));
  assert.ok(
    calls.some((c) => c.method === "answerCallbackQuery" && c.body.callback_query_id === "cb1"),
    "callback spinner is closed",
  );
});

test("a half-typed 'send' gets a focused example, not a wall of help", async () => {
  const { bot, sent } = makeBot(stubWallet());
  await bot.onUpdate({
    message: { text: "send", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  assert.match(sent().body.text, /send 5 CC to @ada/);
});

test("no Telegram username: asked to set one, wallet never touched", async () => {
  let touched = false;
  const { bot, sent } = makeBot(stubWallet({ ensureAccount: async () => ((touched = true), {}) }));
  await bot.onUpdate({
    message: { text: "/start", chat: { id: 1, type: "private" }, from: {} },
  });
  assert.match(sent().body.text, /Set a Telegram username/);
  assert.equal(touched, false);
});

test("pool full: onboarding reports capacity instead of throwing", async () => {
  const { bot, sent } = makeBot(
    stubWallet({
      ensureAccount: async () => {
        const e = new Error("full");
        e.code = "POOL_EXHAUSTED";
        throw e;
      },
    }),
  );
  await bot.onUpdate({
    message: { text: "/start", chat: { id: 1, type: "private" }, from: { username: "bayo" } },
  });
  assert.match(sent().body.text, /capacity/i);
});
