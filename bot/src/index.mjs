// Entrypoint: wire config -> ledger -> wallet -> Telegram.
//
//   SELKIE_TELEGRAM_TOKEN=... SELKIE_OPERATOR=... node src/index.mjs
//
// With no operator party configured it allocates one and prints it, so a fresh
// sandbox is one command away from a working bot.

import { ledgerFromEnv } from "./ledger.mjs";
import { Wallet } from "./wallet.mjs";
import { TelegramBot } from "./telegram.mjs";

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

const wallet = new Wallet({ ledger, operator });

if (!cfg.telegramToken) {
  console.error("SELKIE_TELEGRAM_TOKEN is required to start the bot (get one from @BotFather).");
  process.exit(1);
}

const bot = new TelegramBot({ token: cfg.telegramToken, wallet });
process.on("SIGINT", () => {
  bot.stop();
  process.exit(0);
});
await bot.start();
