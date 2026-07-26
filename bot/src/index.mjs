// Entrypoint: wire config -> ledger -> wallet -> Telegram.
//
//   SELKIE_TELEGRAM_TOKEN=... SELKIE_OPERATOR=... node src/index.mjs
//
// With no operator party configured it allocates one and prints it, so a fresh
// sandbox is one command away from a working bot.

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ledgerFromEnv } from "./ledger.mjs";
import { Wallet } from "./wallet.mjs";
import { TelegramBot } from "./telegram.mjs";
import { XWorker } from "./x.mjs";
import { RemoteHistory } from "./remote-history.mjs";
import { History } from "../../server/src/history.mjs";

const cfg = {
  pkgId: process.env.SELKIE_PKG_ID,
  operator: process.env.SELKIE_OPERATOR,
  telegramToken: process.env.SELKIE_TELEGRAM_TOKEN,
};

if (!cfg.pkgId) {
  console.error(
    "SELKIE_PKG_ID is required.\n" +
      "  daml damlc inspect-dar --json daml/.daml/dist/selkie-0.1.0.dar | jq -r .main_package_id",
  );
  process.exit(1);
}

const { ledger, live } = ledgerFromEnv();

let operator = cfg.operator;
if (!operator) {
  if (live) {
    console.error("SELKIE_OPERATOR is required when running against a real validator.");
    process.exit(1);
  }
  operator = await ledger.ensureOperatorParty();
  console.log(`Using LocalNet operator party. Pin it with:\n  export SELKIE_OPERATOR=${operator}\n`);
}

// Same as the web server: a shared node hands us a pool of parties to claim
// from, a node we run lets us allocate. SELKIE_PARTY_POOL=1 selects the pool.
const pool = process.env.SELKIE_PARTY_POOL === "1";
const wallet = new Wallet({ ledger, operator, pool });

// Both surfaces share one wallet and one ledger; each starts only when its own
// credentials are present, so this single process can run Telegram, the X
// worker, or both. The .data/ dir is gitignored and its path is module-relative
// so it is independent of the launch cwd.
const here = dirname(fileURLToPath(import.meta.url));
const tasks = [];

// Telegram surface: starts when a BotFather token is set. Telegram handles are
// their own wallet namespace, so they keep their own activity log.
if (cfg.telegramToken) {
  const historyPath = process.env.SELKIE_TG_HISTORY ?? join(here, "../../.data/tg-history.jsonl");
  const bot = new TelegramBot({ token: cfg.telegramToken, wallet, history: new History(historyPath) });
  process.on("SIGINT", () => bot.stop());
  tasks.push(bot.start());
}

// X surface: starts when the @SelkiePay OAuth 1.0a keys are all set. The
// since_id baseline is persisted so a restart never replays old mentions.
const xKeys = {
  apiKey: process.env.X_API_KEY,
  apiSecret: process.env.X_API_SECRET,
  accessToken: process.env.X_ACCESS_TOKEN,
  accessSecret: process.env.X_ACCESS_SECRET,
  handle: process.env.X_BOT_HANDLE || "SelkiePay",
};
if (xKeys.apiKey && xKeys.apiSecret && xKeys.accessToken && xKeys.accessSecret) {
  const statePath = join(here, "../../.data/x-state.json");
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    /* first run: no saved baseline yet */
  }
  const saveState = (s) => {
    try {
      fs.mkdirSync(dirname(statePath), { recursive: true });
      fs.writeFileSync(statePath, JSON.stringify(s));
    } catch (err) {
      console.error(`x state save failed: ${err.message}`);
    }
  };
  // The web dashboard's history lives on another host (Railway); the bot runs
  // here. When an API URL and ingest secret are set, push activity to the
  // server so it shows in the web feed and gets a receipt page; otherwise fall
  // back to a local file for offline/dev runs.
  const apiUrl = process.env.SELKIE_API_URL;
  const ingestSecret = process.env.SELKIE_INGEST_SECRET;
  const xHistory =
    apiUrl && ingestSecret
      ? new RemoteHistory({ apiUrl, secret: ingestSecret })
      : new History(process.env.SELKIE_HISTORY ?? join(here, "../../.data/history.jsonl"));
  const worker = new XWorker({
    ...xKeys,
    wallet,
    history: xHistory,
    webUrl: process.env.SELKIE_WEB_URL || "https://selkiepay.vercel.app",
    state,
    saveState,
  });
  process.on("SIGINT", () => worker.stop());
  tasks.push(worker.start());
  console.log(`Starting Selkie X worker for @${xKeys.handle}.`);
}

if (!tasks.length) {
  console.error(
    "Nothing to run. Set SELKIE_TELEGRAM_TOKEN for the Telegram bot, and/or\n" +
      "X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET for the X worker.",
  );
  process.exit(1);
}

process.on("SIGINT", () => process.exit(0));
await Promise.all(tasks);
