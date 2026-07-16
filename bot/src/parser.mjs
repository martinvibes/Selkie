// Sotto command parser — turns a mention text into a structured command.
// Shared by the X worker and the Telegram bot so both surfaces behave
// identically. Pure function: no I/O, fully unit-testable.

const ASSETS = new Set(["CC", "USDCX", "CBTC", "CETH"]);

const AMOUNT = String.raw`(\d+(?:\.\d+)?)`;
const ASSET = String.raw`([A-Za-z]+)`;
const HANDLE = String.raw`@(\w{1,30})`;

const RULES = [
  {
    type: "send",
    re: new RegExp(`\\bsend\\s+${AMOUNT}\\s+${ASSET}\\s+to\\s+${HANDLE}(?:\\s+(.*))?`, "i"),
    map: (m) => ({ amount: m[1], asset: m[2], to: m[3], memo: m[4] ?? "" }),
  },
  {
    type: "request",
    re: new RegExp(`\\brequest\\s+${AMOUNT}\\s+${ASSET}\\s+from\\s+${HANDLE}(?:\\s+(.*))?`, "i"),
    map: (m) => ({ amount: m[1], asset: m[2], from: m[3], memo: m[4] ?? "" }),
  },
  {
    type: "escrow",
    re: new RegExp(`\\bescrow\\s+${AMOUNT}\\s+${ASSET}\\s+with\\s+${HANDLE}\\s+for\\s+"([^"]+)"`, "i"),
    map: (m) => ({ amount: m[1], asset: m[2], with: m[3], terms: m[4] }),
  },
  {
    type: "split",
    re: new RegExp(`\\bsplit\\s+${AMOUNT}\\s+${ASSET}\\s+among\\s+((?:${HANDLE}[\\s,]*)+)`, "i"),
    map: (m) => ({
      amount: m[1],
      asset: m[2],
      among: [...m[3].matchAll(/@(\w{1,30})/g)].map((h) => h[1]),
    }),
  },
  {
    type: "reward",
    re: new RegExp(`\\breward\\s+top\\s+(\\d+)\\s+repl(?:y|ies)\\s+with\\s+${AMOUNT}\\s+${ASSET}`, "i"),
    map: (m) => ({ winners: Number(m[1]), amount: m[2], asset: m[3] }),
  },
  {
    type: "balance",
    re: /\bbalance\b/i,
    map: () => ({}),
  },
];

/**
 * @param {string} text - raw mention/message text
 * @returns {{type: string, [k: string]: unknown} | null}
 */
export function parseCommand(text) {
  const cleaned = text.replace(/@SottoPay/gi, " ").trim();
  for (const rule of RULES) {
    const m = cleaned.match(rule.re);
    if (!m) continue;
    const cmd = { type: rule.type, ...rule.map(m) };
    if ("asset" in cmd) {
      const asset = String(cmd.asset).toUpperCase();
      if (!ASSETS.has(asset)) return { type: "error", reason: `unknown asset: ${cmd.asset}` };
      cmd.asset = asset;
    }
    if ("amount" in cmd && Number(cmd.amount) <= 0) {
      return { type: "error", reason: "amount must be positive" };
    }
    return cmd;
  }
  return null;
}
