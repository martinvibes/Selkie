// Telegram surface: long-polling bot, no dependencies.
//
// Telegram is the demo-safe twin of the X worker — same parser, same dispatch,
// same ledger — so a judge can watch real Canton contracts move in a chat
// without us depending on X API approval.

import { handleCommand, HELP } from "./dispatch.mjs";

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

  send(chatId, text) {
    // Plain text on purpose: handles like @fan_1 are Markdown italics triggers,
    // and a reply that fails to parse is a reply the user never gets.
    return this.call("sendMessage", { chat_id: chatId, text });
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
    const msg = update.message;
    if (!msg?.text) return;

    // A Telegram username is the wallet identity, exactly like an X handle.
    // Users without one can't be addressed by others, so we ask them to set it.
    const username = msg.from?.username;
    if (!username) {
      await this.send(
        msg.chat.id,
        "Set a Telegram username first (Settings -> Username). Your username is your wallet.",
      );
      return;
    }

    // Telegram-isms collapse into the shared grammar: "/send@selkiepay_bot
    // 5 CC to @ada" and "send 5 CC to @ada" must mean the same thing.
    const text = msg.text.replace(/@\w*bot\b/gi, " ").replace(/^\//, "").trim();

    const reply = await handleCommand({
      wallet: this.wallet,
      from: username,
      text,
      platform: "telegram",
    });
    if (reply) await this.send(msg.chat.id, reply);
    // A DM never goes unanswered: /start and anything unparsed get the help
    // text. Groups stay quiet so the bot never spams a conversation.
    else if (msg.chat.type === "private") await this.send(msg.chat.id, HELP);
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
