// Telegram routing: /start, receive, and the tap menu. The Bot API is faked
// (call() just records what would be sent) and the wallet is stubbed, so this
// checks the chat-native behaviour without a live bot or a ledger.

import { test } from "node:test";
import assert from "node:assert/strict";
import { TelegramBot } from "../src/telegram.mjs";

const stubWallet = (over = {}) => ({
  ensureAccount: async (u) => ({ owner: "selkie-pool-01::1220abcd", handle: `@${u.toLowerCase()}`, created: true }),
  balance: async () => ({ CC: 12 }),
  requests: async () => ({ incoming: [], outgoing: [] }),
  ...over,
});

function makeBot(wallet) {
  const calls = [];
  const bot = new TelegramBot({ token: "t", wallet, log: () => {} });
  bot.call = async (method, body) => {
    calls.push({ method, body });
    return {};
  };
  return { bot, calls, sent: () => calls.find((c) => c.method === "sendMessage") };
}

test("/start opens a wallet and shows the tap menu", async () => {
  const { bot, sent } = makeBot(stubWallet());
  await bot.onUpdate({
    message: { text: "/start", chat: { id: 1, type: "private" }, from: { username: "Bayo" } },
  });
  assert.match(sent().body.text, /Welcome to Selkie, @bayo/);
  assert.ok(sent().body.reply_markup?.inline_keyboard, "reply carries the menu");
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

test("tapping Balance replies and closes the callback spinner", async () => {
  const { bot, calls } = makeBot(stubWallet());
  await bot.onUpdate({
    callback_query: { id: "cb1", data: "balance", message: { chat: { id: 1 } }, from: { username: "bayo" } },
  });
  assert.ok(calls.some((c) => c.method === "sendMessage" && /balance/i.test(c.body.text)));
  assert.ok(
    calls.some((c) => c.method === "answerCallbackQuery" && c.body.callback_query_id === "cb1"),
    "callback is answered",
  );
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
