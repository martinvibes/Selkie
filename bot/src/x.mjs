// X (Twitter) surface: a worker that turns @SelkiePay mentions into ledger
// actions. Telegram is the demo-safe twin; this is the same parser, the same
// dispatch, the same ledger, reached from a public reply on the timeline.
//
// Two things are genuinely X-specific and live here:
//
//   1. OAuth 1.0a request signing. Posting as @SelkiePay needs the bot
//      account's own user tokens (the app-only bearer can read but never post),
//      so every call is signed with HMAC-SHA1 the classic way. User tokens do
//      not expire, which is what makes them the right fit for a long-running
//      worker.
//   2. Timeline etiquette. We only ever act on a real command, we never post a
//      balance or history in public (those stay in the wallet), and every reply
//      is plain text capped at 280 characters.

import crypto from "node:crypto";
import { handleCommand } from "./dispatch.mjs";
import { parseCommand } from "./parser.mjs";

const API = "https://api.twitter.com/2";

// RFC 3986 percent-encoding. encodeURIComponent leaves !*'() alone; OAuth wants
// them encoded too, so the signature base matches what the server rebuilds.
const enc = (s) =>
  encodeURIComponent(String(s)).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );

// dispatch speaks Telegram HTML (<b>/<code> plus three escaped entities). X
// shows plain text, so strip the tags, decode the entities, and cap at 280.
export function htmlToText(html) {
  const text = String(html)
    .replace(/<\/?(?:b|code)>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return text.length > 280 ? text.slice(0, 279) + "…" : text;
}

export class XWorker {
  /**
   * @param {object} cfg
   * @param {string} cfg.apiKey        - OAuth 1.0a consumer (API) key
   * @param {string} cfg.apiSecret     - OAuth 1.0a consumer (API) secret
   * @param {string} cfg.accessToken   - @SelkiePay access token (read + write)
   * @param {string} cfg.accessSecret  - @SelkiePay access token secret
   * @param {string} [cfg.handle]      - the bot's own handle, default SelkiePay
   * @param {import("./wallet.mjs").Wallet} cfg.wallet
   * @param {import("../../server/src/history.mjs").History} [cfg.history] - activity log the web dashboard reads
   * @param {string} [cfg.webUrl] - web app base, used to link a payment receipt
   * @param {number} [cfg.pollSeconds] - seconds between mention polls
   * @param {object} [cfg.state]       - restored { sinceId }
   * @param {(state: object) => void} [cfg.saveState] - persist { sinceId }
   * @param {(msg: string) => void} [cfg.log]
   */
  constructor({
    apiKey,
    apiSecret,
    accessToken,
    accessSecret,
    handle = "SelkiePay",
    wallet,
    history = null,
    webUrl = "https://selkiepay.vercel.app",
    pollSeconds = 10,
    state = {},
    saveState = null,
    log = console.log,
  }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = accessToken;
    this.accessSecret = accessSecret;
    this.handle = String(handle).replace(/^@/, "");
    this.wallet = wallet;
    this.history = history;
    this.webUrl = webUrl;
    this.pollMs = Math.max(5, pollSeconds) * 1000;
    this.saveState = saveState;
    this.sinceId = state.sinceId ?? null;
    this.log = log;
    this.userId = null;
    this.running = false;
    this.seen = new Set();
    // A restored since_id means we are past the first run and should act on
    // anything new. A fresh start instead takes the current newest mention as a
    // baseline, so a first deploy never replays an old backlog of mentions.
    this.baselineSet = state.sinceId != null;
  }

  // --- OAuth 1.0a user-context signing -------------------------------------
  // The signature covers the method, the base URL, and every oauth_* and query
  // parameter. JSON request bodies are not part of the signature, so the same
  // routine serves the GET (mentions) and the POST (reply).
  authHeader(method, url, queryParams = {}) {
    const oauth = {
      oauth_consumer_key: this.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: this.accessToken,
      oauth_version: "1.0",
    };
    const all = { ...oauth, ...queryParams };
    const paramString = Object.keys(all)
      .sort()
      .map((k) => `${enc(k)}=${enc(all[k])}`)
      .join("&");
    const base = [method.toUpperCase(), enc(url), enc(paramString)].join("&");
    const key = `${enc(this.apiSecret)}&${enc(this.accessSecret)}`;
    oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
    return (
      "OAuth " +
      Object.keys(oauth)
        .sort()
        .map((k) => `${enc(k)}="${enc(oauth[k])}"`)
        .join(", ")
    );
  }

  async get(path, query = {}) {
    const url = `${API}${path}`;
    const qs = Object.keys(query)
      .map((k) => `${enc(k)}=${enc(query[k])}`)
      .join("&");
    const res = await fetch(qs ? `${url}?${qs}` : url, {
      headers: { authorization: this.authHeader("GET", url, query) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  async postJson(path, body) {
    const url = `${API}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: this.authHeader("POST", url),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${JSON.stringify(json)}`);
    return json;
  }

  // --- worker --------------------------------------------------------------

  /** Resolve our own numeric id once, so we can read our mentions timeline. */
  async resolveSelf() {
    const me = await this.get(`/users/by/username/${this.handle}`);
    this.userId = me.data?.id;
    if (!this.userId) throw new Error(`could not resolve @${this.handle}`);
    return this.userId;
  }

  /** Post a public reply under a tweet. */
  reply(text, inReplyToId) {
    return this.postJson("/tweets", { text, reply: { in_reply_to_tweet_id: inReplyToId } });
  }

  /** One poll cycle. Exposed separately so a test can drive it. */
  async poll() {
    const query = {
      max_results: 20,
      expansions: "author_id",
      "tweet.fields": "author_id",
      "user.fields": "username",
    };
    if (this.sinceId) query.since_id = this.sinceId;

    const res = await this.get(`/users/${this.userId}/mentions`, query);
    const tweets = res.data ?? [];
    const users = new Map((res.includes?.users ?? []).map((u) => [u.id, u.username]));
    if (res.meta?.newest_id) this.sinceId = res.meta.newest_id;

    let acted = 0;
    if (this.baselineSet) {
      // Oldest-first, so a burst of replies reads in the order it was sent.
      for (const t of [...tweets].reverse()) {
        if (this.seen.has(t.id)) continue;
        this.seen.add(t.id);
        const author = users.get(t.author_id);
        // Skip our own tweets, so a reply we post never triggers itself.
        if (!author || author.toLowerCase() === this.handle.toLowerCase()) continue;
        await this.act(t, author).catch((err) => this.log(`mention ${t.id} failed: ${err.message}`));
        acted++;
      }
    }
    this.baselineSet = true;
    if (this.saveState && this.sinceId) this.saveState({ sinceId: this.sinceId });
    return acted;
  }

  /** Turn one mention into a ledger action and a public reply. */
  async act(tweet, author) {
    const cmd = parseCommand(tweet.text);
    // Only act on real commands. Random mentions get no reply, which keeps us
    // off the timeline as noise and off the metered post budget.
    if (!cmd || cmd.type === "error") return;

    // A balance or a history is private by design. Never put one on the public
    // timeline: point the person to their wallet instead.
    if (cmd.type === "balance" || cmd.type === "history") {
      await this.reply(
        "That stays private. Open your wallet at selkiepay.vercel.app to see it.",
        tweet.id,
      );
      return;
    }

    const reply = await handleCommand({
      wallet: this.wallet,
      from: author,
      text: tweet.text,
      platform: "x",
      history: this.history,
      txLinkBase: this.webUrl,
    });
    if (reply) await this.reply(htmlToText(reply), tweet.id);
  }

  async start() {
    this.running = true;
    await this.resolveSelf();
    this.log(`Selkie X worker live as @${this.handle} (id ${this.userId})`);
    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        this.log(`x poll error: ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, this.pollMs));
    }
  }

  stop() {
    this.running = false;
  }
}
