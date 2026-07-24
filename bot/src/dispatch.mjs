// Command -> ledger -> human reply. Shared by every surface (Telegram now,
// X next), so a command means exactly the same thing wherever it's typed.
//
// Replies are Telegram-flavoured HTML: <b> for headings, <code> for the bits
// you tap to copy (amounts, addresses, ready-to-send commands). The only
// untrusted text is a user's memo, so that is the only thing we escape.

import { parseCommand } from "./parser.mjs";
import { normalizeHandle } from "./wallet.mjs";

// User handles are [\w-] and amounts are numbers, so memos and raw ledger
// errors are the only strings that can carry markup. Escape those, nothing else.
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// On-ledger asset codes are uppercase; people read them lowercase-prefixed.
const LABELS = { CC: "CC", USDCX: "USDCX", CBTC: "cBTC", CETH: "cETH" };
const label = (asset) => LABELS[asset] ?? asset;

const fmt = (n) => String(Number(n)).replace(/\.0+$/, "");

const HELP = [
  "<b>Selkie</b>",
  "Your @handle is your wallet.",
  "",
  "<b>Pay</b>",
  "<code>send 5 CC to @bayo</code>",
  "",
  "<b>Get paid</b>",
  "<code>request 10 CC from @ada</code>",
  "Tap 📥 Receive for your address.",
  "",
  "<b>Requests</b>",
  "<code>requests</code> · see who's waiting",
  "<code>approve @ada</code> · pay them",
  "<code>decline @ada</code> · say no",
  "",
  "<b>Wallet</b>",
  "<code>balance</code> · <code>history</code>",
  "",
  "Assets: CC, USDCX, cBTC, cETH.",
  "No app, no seed phrase, no gas.",
].join("\n");

function formatBalance(balances) {
  const lines = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([asset, v]) => `<code>${fmt(v)}</code> ${label(asset)}`);
  if (!lines.length) {
    return "Your wallet is empty. Share your @handle and someone can pay you into it.";
  }
  return ["<b>Your balance</b>", ...lines, "", "Only you and the sender can see this."].join("\n");
}

/** Shared by the "requests" command and Telegram's tap view. */
export function formatRequests(incoming, outgoing) {
  if (!incoming.length && !outgoing.length) return "No open requests right now.";
  const lines = [];
  if (incoming.length) {
    lines.push("<b>Waiting on you</b>");
    for (const r of incoming) {
      const why = r.memo ? ` · ${esc(r.memo)}` : "";
      lines.push(`${r.from} asked for <code>${fmt(r.amount)}</code> ${label(r.asset)}${why}`);
    }
    lines.push("", 'Reply <code>approve @handle</code> to pay, or <code>decline @handle</code>.');
  }
  if (outgoing.length) {
    if (lines.length) lines.push("");
    lines.push("<b>You are waiting on</b>");
    for (const r of outgoing) {
      lines.push(`${r.to} for <code>${fmt(r.amount)}</code> ${label(r.asset)}`);
    }
  }
  return lines.join("\n");
}

function dayLabel(ts, now) {
  const d = new Date(ts);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date(now)) - startOf(d)) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A grouped, newest-first activity log for one handle. */
export function formatHistory(items, now = Date.now()) {
  if (!items.length) {
    return ["<b>Your activity</b>", "", "Nothing yet. Sends and payments show up here."].join("\n");
  }
  const out = ["<b>Your activity</b>"];
  let lastDay = null;
  for (const e of items) {
    const day = dayLabel(e.ts, now);
    if (day !== lastDay) {
      out.push("", `<b>${day}</b>`);
      lastDay = day;
    }
    const outgoing = e.direction === "out";
    const arrow = outgoing ? "↑" : "↓";
    const prep = outgoing ? "to" : "from";
    const other = outgoing ? e.to : e.from;
    const memo = e.memo && e.memo !== "request" ? ` · ${esc(e.memo)}` : "";
    out.push(`${arrow} <code>${fmt(e.amount)}</code> ${label(e.asset)} ${prep} ${other}${memo}`);
  }
  return out.join("\n");
}

/**
 * @param {object} ctx
 * @param {import("./wallet.mjs").Wallet} ctx.wallet
 * @param {string} ctx.from      - sender's social handle
 * @param {string} ctx.text      - raw message text
 * @param {string} ctx.platform  - "x" | "telegram"
 * @param {import("../../server/src/history.mjs").History} [ctx.history] - activity log, if the surface keeps one
 * @returns {Promise<string|null>} reply text, or null when the message isn't for us
 */
export async function handleCommand({ wallet, from, text, platform = "x", history = null }) {
  const cmd = parseCommand(text);
  if (!cmd) return null;
  if (cmd.type === "error") return `I couldn't do that: ${esc(cmd.reason)}`;

  try {
    switch (cmd.type) {
      case "balance": {
        await wallet.ensureAccount(from, platform);
        return formatBalance(await wallet.balance(from, platform));
      }

      case "history": {
        if (!history) return "History isn't available here yet.";
        const me = normalizeHandle(from);
        return formatHistory(await history.forHandle(me, 20));
      }

      case "send": {
        const res = await wallet.send({
          from,
          to: cmd.to,
          asset: cmd.asset,
          amount: cmd.amount,
          memo: cmd.memo,
          platform,
        });
        if (history) {
          await history.append({
            type: "send",
            from: res.from ?? normalizeHandle(from),
            to: res.to,
            asset: res.asset,
            amount: res.amount,
            memo: cmd.memo || "",
          });
        }
        const head = `Sent <code>${fmt(res.amount)}</code> ${label(res.asset)} to ${res.to}.`;
        return res.onboarded
          ? `${head}\n${res.to} had no wallet, so Selkie just made one for them. The money is already theirs.`
          : `${head}\nSettled on Canton. Nobody else can see the amount.`;
      }

      case "reward": {
        // Winner selection comes from the platform (top replies); until the X
        // worker supplies them we can't invent them.
        return "Reward campaigns run from the X worker, which picks winners from replies. Coming in the next build.";
      }

      case "request": {
        const res = await wallet.requestPayment({
          from,
          to: cmd.from,
          asset: cmd.asset,
          amount: cmd.amount,
          memo: cmd.memo,
          platform,
        });
        const head = `Asked ${res.to} for <code>${fmt(res.amount)}</code> ${label(res.asset)}.`;
        return res.onboarded
          ? `${head}\n${res.to} had no wallet, so Selkie made them one. They can pay you by replying <code>approve</code>.`
          : `${head}\nThey pay by replying <code>approve</code>. Nothing moves until they do.`;
      }

      case "requests": {
        const { incoming, outgoing } = await wallet.requests(from, platform);
        return formatRequests(incoming, outgoing);
      }

      case "approve":
      case "decline": {
        const { incoming } = await wallet.requests(from, platform);
        if (!incoming.length) return "You have no open requests to answer.";

        const wanted = cmd.from ? normalizeHandle(cmd.from) : null;
        const matches = wanted ? incoming.filter((r) => r.from === wanted) : incoming;
        if (!matches.length) return `No open request from ${wanted}.`;
        if (matches.length > 1) {
          const who = matches.map((r) => r.from).join(", ");
          return `You have more than one open request (${who}). Say <code>${cmd.type} @handle</code> to pick one.`;
        }

        const target = matches[0];
        if (cmd.type === "decline") {
          await wallet.declineRequest({ cid: target.cid, payerHandle: from, platform });
          return `Declined ${target.from}'s request for <code>${fmt(target.amount)}</code> ${label(target.asset)}. No money moved.`;
        }
        const paid = await wallet.approveRequest({ cid: target.cid, payerHandle: from, platform });
        if (history) {
          await history.append({
            type: "payment",
            from: paid.from ?? normalizeHandle(from),
            to: paid.to,
            asset: paid.asset,
            amount: paid.amount,
            memo: "request",
          });
        }
        return `Paid ${paid.to} <code>${fmt(paid.amount)}</code> ${label(paid.asset)}.\nSettled on Canton. Nobody else can see the amount.`;
      }

      case "escrow":
      case "split":
        return `${cmd.type} is built on the ledger and lands on this surface next.`;

      default:
        return HELP;
    }
  } catch (err) {
    if (err.code === "INSUFFICIENT_FUNDS") return `Not enough funds: ${esc(err.message)}`;
    if (err.code === "NO_SENDER_WALLET") return "You don't have a Selkie wallet yet. Say <code>balance</code> to open one.";
    return `That didn't go through: ${esc(err.message)}`;
  }
}

export { HELP, fmt, label, esc };
