// Telegram surface: long-polling bot, no dependencies.
//
// Telegram is the demo-safe twin of the X worker — same parser, same dispatch,
// same ledger — so a judge can watch real Canton contracts move in a chat
// without us depending on X API approval. Beyond the shared commands it adds
// the chat-native bits: a /start that opens a wallet, a persistent nav bar,
// copy buttons for your handle and address, and tap-to-pay on requests.

import { handleCommand, formatRequests, HELP, fmt, label } from "./dispatch.mjs";
import { normalizeHandle } from "./wallet.mjs";

// Persistent bottom bar. Each button just sends its text; onUpdate strips the
// leading emoji so "💰 Balance" routes exactly like typing "balance". One tap
// to anywhere is the whole point — no scrolling back for a menu.
const NAV = {
  keyboard: [
    [{ text: "💰 Balance" }, { text: "📥 Receive" }],
    [{ text: "📨 Requests" }, { text: "🧾 History" }],
    [{ text: "❔ Help" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

// Two ways to share who you are: your handle and your address. copy_text
// buttons (Bot API 7.11) drop the value straight on the clipboard; the values
// are also in the message body (inside <code>) so any client can tap to copy.
const receiveKeyboard = (handle, address) => ({
  inline_keyboard: [
    [{ text: `Copy ${handle}`, copy_text: { text: handle } }],
    [{ text: "Copy Canton address", copy_text: { text: address } }],
  ],
});

// Reply-keyboard buttons arrive with their emoji; a message can also just open
// with one. Strip a leading run of emoji/spaces so routing sees the word.
const LEAD_EMOJI = /^[\s\p{Extended_Pictographic}️‍]+/u;

export class TelegramBot {
  /**
   * @param {object} cfg
   * @param {string} cfg.token   - BotFather token
   * @param {import("./wallet.mjs").Wallet} cfg.wallet
   * @param {import("../../server/src/history.mjs").History} [cfg.history]
   * @param {(msg: string) => void} [cfg.log]
   */
  constructor({ token, wallet, history = null, log = console.log }) {
    this.token = token;
    this.wallet = wallet;
    this.history = history;
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
    // HTML on purpose: <b>/<code> give the replies structure, and unlike
    // Markdown it never trips over an @handle. Dispatch escapes user memos.
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...extra,
    });
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

    // Collapse Telegram-isms into the shared grammar: strip the @bot mention,
    // a tapped button's leading emoji, and a leading slash, so
    // "/send@selkiepay_bot 5 CC to @ada", "💰 Balance" and "balance" all land.
    const text = msg.text
      .replace(/@\w*bot\b/gi, " ")
      .replace(LEAD_EMOJI, "")
      .replace(/^\//, "")
      .trim();
    const word = text.toLowerCase();
    const priv = msg.chat.type === "private";

    // Chat-native views the shared parser has no reply shape for.
    if (word === "start" || word === "") return this.onStart(msg.chat.id, username);
    if (["receive", "address", "deposit", "get paid"].includes(word)) return this.onReceive(msg.chat.id, username);
    if (word === "requests") return this.onRequests(msg.chat.id, username);
    if (word === "menu" || word === "help") return this.send(msg.chat.id, HELP, priv ? { reply_markup: NAV } : {});

    // Everything else is a real command: parsed, run on the ledger, replied.
    const reply = await handleCommand({
      wallet: this.wallet,
      from: username,
      text,
      platform: "telegram",
      history: this.history,
    });
    if (reply) {
      await this.send(msg.chat.id, reply, priv ? { reply_markup: NAV } : {});
    } else if (priv) {
      // A DM never goes unanswered. Near-miss verbs get a focused nudge; the
      // rest get the organised help. Groups stay quiet so we never spam.
      await this.send(msg.chat.id, this.hint(word), { reply_markup: NAV });
    }
  }

  /** A focused example for a half-typed command, else the full help. */
  hint(word) {
    const verb = word.split(/\s+/)[0];
    if (verb === "send" || verb === "pay") return "To send: <code>send 5 CC to @ada</code>";
    if (verb === "request" || verb === "ask") return "To request: <code>request 10 CC from @ada</code>";
    return HELP;
  }

  /** A tapped button on a message (approve/decline on a request). */
  async onCallback(cq) {
    const chatId = cq.message?.chat?.id;
    const username = cq.from?.username;
    try {
      if (!username) {
        await this.answerCallback(cq.id, "Set a Telegram username first.");
        return;
      }
      const [verb, handle] = String(cq.data ?? "").split(":");
      if ((verb === "approve" || verb === "decline") && handle) {
        const reply = await handleCommand({
          wallet: this.wallet,
          from: username,
          text: `${verb} @${handle}`,
          platform: "telegram",
          history: this.history,
        });
        if (reply) await this.send(chatId, reply, { reply_markup: NAV });
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
          { reply_markup: NAV },
        );
      }
      throw err;
    }

    // New vs returning off the account alone is wrong: someone paid before they
    // ever opened the bot has an account too. Read the balance and greet to fit.
    let funded = false;
    try {
      funded = Object.values(await this.wallet.balance(username, "telegram")).some((v) => v > 0);
    } catch {
      /* balance is a nicety here, never a reason to fail /start */
    }

    const lines = [`<b>Welcome to Selkie, ${handle}</b>`, ""];
    if (account.created) {
      lines.push("Your private wallet is ready.");
    } else if (funded) {
      lines.push("Welcome back. You've got a balance waiting. Tap 💰 Balance to see it.");
    } else {
      lines.push("Welcome back.");
    }
    lines.push(
      "",
      "Your @handle is your wallet. People pay you by your username, and nobody sees your balance but you.",
      "",
      "<b>Try one</b>",
      "<code>send 5 CC to @ada</code>",
      "<code>balance</code>",
      "",
      "No app, no seed phrase, no gas.",
    );
    await this.send(chatId, lines.join("\n"), { reply_markup: NAV });
  }

  /** Receive: your handle and address, with buttons that copy each. */
  async onReceive(chatId, username) {
    const handle = normalizeHandle(username);
    let account;
    try {
      account = await this.wallet.ensureAccount(username, "telegram");
    } catch (err) {
      if (err.code === "POOL_EXHAUSTED") {
        return this.send(chatId, "Selkie is at capacity on this test network. New wallets are on hold.", {
          reply_markup: NAV,
        });
      }
      throw err;
    }
    const text = [
      "<b>Get paid</b>",
      "",
      `Handle   <code>${handle}</code>`,
      `Address  <code>${account.owner}</code>`,
      "",
      "On Selkie, people pay you by your handle. Use the address to receive from a wallet elsewhere on Canton.",
    ].join("\n");
    await this.send(chatId, text, { reply_markup: receiveKeyboard(handle, account.owner) });
  }

  /** Requests: the list, plus a tap-to-pay button for each one owed. */
  async onRequests(chatId, username) {
    let incoming = [];
    let outgoing = [];
    try {
      ({ incoming, outgoing } = await this.wallet.requests(username, "telegram"));
    } catch (err) {
      return this.send(chatId, `Couldn't load your requests: ${err.message}`, { reply_markup: NAV });
    }
    const text = formatRequests(incoming, outgoing);
    const rows = incoming.slice(0, 6).map((r) => {
      const h = r.from.replace(/^@/, "");
      return [
        { text: `Pay ${r.from} ${fmt(r.amount)} ${label(r.asset)}`, callback_data: `approve:${h}` },
        { text: "Decline", callback_data: `decline:${h}` },
      ];
    });
    const extra = rows.length ? { reply_markup: { inline_keyboard: rows } } : { reply_markup: NAV };
    await this.send(chatId, text, extra);
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
