// Telegram surface: long-polling bot, no dependencies.
//
// Telegram is the demo-safe twin of the X worker — same parser, same dispatch,
// same ledger — so a judge can watch real Canton contracts move in a chat
// without us depending on X API approval. Beyond the shared commands it adds
// the chat-native bits: a /start that opens a wallet, a tap menu, and copy
// buttons for your handle and your Canton address.

import { handleCommand, HELP } from "./dispatch.mjs";
import { normalizeHandle } from "./wallet.mjs";

// The tap menu under a reply. Emoji are functional labels, not decoration.
const MENU = {
  inline_keyboard: [
    [
      { text: "💰 Balance", callback_data: "balance" },
      { text: "📥 Receive", callback_data: "receive" },
    ],
    [
      { text: "📨 Requests", callback_data: "requests" },
      { text: "❔ Help", callback_data: "help" },
    ],
  ],
};

// Two ways to share who you are: your handle and your address. copy_text
// buttons (Bot API 7.11) drop the value straight on the clipboard; the values
// are also in the message body so older clients can long-press to copy.
const receiveKeyboard = (handle, address) => ({
  inline_keyboard: [
    [{ text: `Copy ${handle}`, copy_text: { text: handle } }],
    [{ text: "Copy Canton address", copy_text: { text: address } }],
  ],
});

export class TelegramBot {
  /**
   * @param {object} cfg
   * @param {string} cfg.token   - BotFather token
   * @param {import("./wallet.mjs").Wallet} cfg.wallet
   * @param {(msg: string) => void} [cfg.log]
   */
  constructor({ token, wallet, log = console.log }) {
    this.token = token;
    this.wallet = wallet;
    this.log = log;
    this.api = `https://api.telegram.org/bot${token}`;
    this.offset = 0;
    this.running = false;
  }

  async call(method, body) {
    const res = await fetch(`${this.api}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`telegram ${method}: ${json.description}`);
    return json.result;
  }

  send(chatId, text, extra = {}) {
    // Plain text on purpose: handles like @fan_1 are Markdown italics triggers,
    // and a reply that fails to parse is a reply the user never gets.
    return this.call("sendMessage", { chat_id: chatId, text, ...extra });
  }

  answerCallback(id, text) {
    return this.call("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });
  }

  /** One poll cycle. Exposed separately so it can be driven by a test. */
  async poll(timeout = 25) {
    const updates = await this.call("getUpdates", { offset: this.offset, timeout });
    for (const update of updates) {
      this.offset = update.update_id + 1;
      await this.onUpdate(update).catch((err) => this.log(`update failed: ${err.message}`));
    }
    return updates.length;
  }

  async onUpdate(update) {
    if (update.callback_query) return this.onCallback(update.callback_query);

    const msg = update.message;
    if (!msg?.text) return;

    // A Telegram username is the wallet identity, exactly like an X handle.
    // Users without one can't be addressed by others, so we ask them to set it.
    const username = msg.from?.username;
    if (!username) {
      await this.send(
        msg.chat.id,
        "Set a Telegram username first (Settings → Username). Your username is your wallet.",
      );
      return;
    }

    // Telegram-isms collapse into the shared grammar: "/send@selkiepay_bot
    // 5 CC to @ada" and "send 5 CC to @ada" must mean the same thing.
    const text = msg.text.replace(/@\w*bot\b/gi, " ").replace(/^\//, "").trim();
    const word = text.toLowerCase();

    // Chat-native commands the shared parser has no reply shape for.
    if (word === "start" || word === "") return this.onStart(msg.chat.id, username);
    if (["receive", "address", "deposit"].includes(word)) return this.onReceive(msg.chat.id, username);
    if (word === "menu" || word === "help") return this.send(msg.chat.id, HELP, { reply_markup: MENU });

    // Everything else is a real command: parsed, run on the ledger, replied.
    const reply = await handleCommand({ wallet: this.wallet, from: username, text, platform: "telegram" });
    if (reply) await this.send(msg.chat.id, reply);
    // A DM never goes unanswered: anything unparsed gets the menu. Groups stay
    // quiet so the bot never spams a conversation.
    else if (msg.chat.type === "private") await this.send(msg.chat.id, HELP, { reply_markup: MENU });
  }

  /** A tapped menu button. */
  async onCallback(cq) {
    const chatId = cq.message?.chat?.id;
    const username = cq.from?.username;
    try {
      if (!username) {
        await this.answerCallback(cq.id, "Set a Telegram username first.");
        return;
      }
      if (cq.data === "receive") {
        await this.onReceive(chatId, username);
      } else if (cq.data === "help") {
        await this.send(chatId, HELP, { reply_markup: MENU });
      } else if (cq.data === "balance" || cq.data === "requests") {
        const reply = await handleCommand({
          wallet: this.wallet,
          from: username,
          text: cq.data,
          platform: "telegram",
        });
        await this.send(chatId, reply ?? HELP, { reply_markup: MENU });
      }
      await this.answerCallback(cq.id);
    } catch (err) {
      await this.answerCallback(cq.id, "Something went wrong.");
      this.log(`callback failed: ${err.message}`);
    }
  }

  /** /start: open the wallet and welcome them in. */
  async onStart(chatId, username) {
    const handle = normalizeHandle(username);
    let account;
    try {
      account = await this.wallet.ensureAccount(username, "telegram");
    } catch (err) {
      if (err.code === "POOL_EXHAUSTED") {
        return this.send(
          chatId,
          "Selkie is at capacity on this test network — new wallets are on hold while we add more. Check back shortly.",
        );
      }
      throw err;
    }
    const text = [
      `Welcome to Selkie, ${handle}.`,
      "",
      account.created ? "Your private wallet is ready." : "Welcome back — your wallet is right here.",
      "Your handle is your wallet. People can pay you just by your @username, and nobody sees your balance but you.",
      "",
      "Try one:",
      "  send 5 CC to @ada",
      "  balance",
      "",
      "No app, no seed phrase, no gas.",
    ].join("\n");
    await this.send(chatId, text, { reply_markup: MENU });
  }

  /** Receive: your handle and address, with buttons that copy each. */
  async onReceive(chatId, username) {
    const handle = normalizeHandle(username);
    let account;
    try {
      account = await this.wallet.ensureAccount(username, "telegram");
    } catch (err) {
      if (err.code === "POOL_EXHAUSTED") {
        return this.send(chatId, "Selkie is at capacity on this test network. New wallets are on hold.");
      }
      throw err;
    }
    const text = [
      "Get paid",
      "",
      `Your handle:  ${handle}`,
      `Your address: ${account.owner}`,
      "",
      "People on Selkie pay you by your handle. Use the address to receive from a wallet elsewhere on Canton.",
    ].join("\n");
    await this.send(chatId, text, { reply_markup: receiveKeyboard(handle, account.owner) });
  }

  async start() {
    this.running = true;
    const me = await this.call("getMe", {});
    this.log(`Selkie bot live as @${me.username}`);
    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        this.log(`poll error: ${err.message}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  stop() {
    this.running = false;
  }
}
