// Command -> ledger -> human reply. Shared by every surface (Telegram now,
// X next), so a command means exactly the same thing wherever it's typed.

import { parseCommand } from "./parser.mjs";
import { normalizeHandle } from "./wallet.mjs";

const HELP = [
  "Selkie — your handle is your wallet.",
  "",
  "send 5 USDCX to @bayo",
  "request 10 CC from @ada",
  "reward top 3 replies with 1 CBTC",
  "balance",
  "",
  "Assets: CC, USDCX, CBTC, CETH. No app, no seed phrase, no gas.",
].join("\n");

const fmt = (n) => String(Number(n)).replace(/\.0+$/, "");

function formatBalance(balances) {
  const lines = Object.entries(balances)
    .filter(([, v]) => v > 0)
    .map(([asset, v]) => `  ${fmt(v)} ${asset}`);
  if (!lines.length) return "Your wallet is empty. Have someone send you something.";
  return ["Your balance:", ...lines, "", "Only you and the sender can see this."].join("\n");
}

/**
 * @param {object} ctx
 * @param {import("./wallet.mjs").Wallet} ctx.wallet
 * @param {string} ctx.from      - sender's social handle
 * @param {string} ctx.text      - raw message text
 * @param {string} ctx.platform  - "x" | "telegram"
 * @returns {Promise<string|null>} reply text, or null when the message isn't for us
 */
export async function handleCommand({ wallet, from, text, platform = "x" }) {
  const cmd = parseCommand(text);
  if (!cmd) return null;
  if (cmd.type === "error") return `I couldn't do that: ${cmd.reason}`;

  try {
    switch (cmd.type) {
      case "balance": {
        await wallet.ensureAccount(from, platform);
        return formatBalance(await wallet.balance(from));
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
        const head = `Sent ${fmt(res.amount)} ${res.asset} to ${res.to}.`;
        return res.onboarded
          ? `${head}\n${res.to} had no wallet, so Selkie just created one for them. They already have the money.`
          : `${head}\nSettled on Canton. Nobody else can see the amount.`;
      }

      case "reward": {
        // Winner selection comes from the platform (top replies); until the X
        // worker supplies them we can't invent them.
        return "Reward campaigns run from the X worker, which picks winners from replies. Coming in the next build.";
      }

      case "request": {
        return `Payment requests are wired to the ledger but need ${normalizeHandle(cmd.from)} to approve from their side. Landing next.`;
      }

      case "escrow":
      case "split":
        return `${cmd.type} is built on the ledger and lands on this surface next.`;

      default:
        return HELP;
    }
  } catch (err) {
    if (err.code === "INSUFFICIENT_FUNDS") return `Not enough funds: ${err.message}`;
    if (err.code === "NO_SENDER_WALLET") return "You don't have a Selkie wallet yet. Say `balance` to create one.";
    return `That didn't go through: ${err.message}`;
  }
}

export { HELP };
