// Boot: config -> ledger -> wallet -> HTTP.
//
//   SELKIE_PKG_ID=... node src/index.mjs

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Ledger } from "../../bot/src/ledger.mjs";
import { Wallet } from "../../bot/src/wallet.mjs";
import { History } from "./history.mjs";
import { createApp } from "./app.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const config = {
  port: Number(process.env.PORT ?? 4000),
  sessionSecret: process.env.SELKIE_SESSION_SECRET ?? randomBytes(32).toString("hex"),
  secureCookies: process.env.SELKIE_SECURE_COOKIES === "1",
  devLogin: process.env.SELKIE_DEV_LOGIN === "1",
  webRoot: resolve(process.env.SELKIE_WEB_ROOT ?? join(here, "../../web")),
  x: {
    clientId: process.env.X_CLIENT_ID ?? "",
    clientSecret: process.env.X_CLIENT_SECRET ?? "",
    redirectUri: process.env.X_REDIRECT_URI ?? `http://localhost:${process.env.PORT ?? 4000}/auth/x/callback`,
  },
};

if (!process.env.SELKIE_PKG_ID) {
  console.error("SELKIE_PKG_ID is required (see README).");
  process.exit(1);
}
if (!process.env.SELKIE_SESSION_SECRET) {
  console.warn("SELKIE_SESSION_SECRET not set: sessions will not survive a restart.");
}

const ledger = new Ledger({
  baseUrl: process.env.SELKIE_JSON_API ?? "http://localhost:7575",
  secret: process.env.SELKIE_JWT_SECRET ?? "secret",
  ledgerId: process.env.SELKIE_LEDGER_ID ?? "sandbox",
  pkgId: process.env.SELKIE_PKG_ID,
});

let operator = process.env.SELKIE_OPERATOR;
if (!operator) {
  const party = await ledger.allocateParty("selkie-operator");
  operator = party.identifier;
  console.log(`Allocated operator party. Reuse it with:\n  export SELKIE_OPERATOR=${operator}\n`);
}

const wallet = new Wallet({ ledger, operator });
const history = new History(process.env.SELKIE_HISTORY ?? join(here, "../../.data/history.jsonl"));

createApp({ wallet, config, history }).listen(config.port, () => {
  console.log(`Selkie on http://localhost:${config.port}`);
  console.log(`  operator: ${operator}`);
  console.log(`  X login:  ${config.x.clientId ? "configured" : "not configured (set X_CLIENT_ID)"}`);
  if (config.devLogin) console.log("  dev login: ENABLED at /auth/dev?handle=name");
});
