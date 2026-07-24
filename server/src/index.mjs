// Boot: config -> ledger -> wallet -> HTTP.
//
//   SELKIE_PKG_ID=... node src/index.mjs

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { ledgerFromEnv } from "../../bot/src/ledger.mjs";
import { amuletParty, cbtcParty } from "../../bot/src/token.mjs";
import { Wallet } from "../../bot/src/wallet.mjs";
import { History } from "./history.mjs";
import { createApp } from "./app.mjs";
import { startSweeper } from "./sweeper.mjs";

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

const { ledger, live } = ledgerFromEnv();

let operator = process.env.SELKIE_OPERATOR;
if (!operator) {
  // On a real validator the operator party is created once, at onboarding, and
  // its id is what people send tokens to. Inventing a fresh one on boot would
  // silently orphan every balance we already hold.
  if (live) {
    console.error("SELKIE_OPERATOR is required when running against a real validator.");
    process.exit(1);
  }
  operator = await ledger.ensureOperatorParty();
  console.log(`Using LocalNet operator party. Pin it with:\n  export SELKIE_OPERATOR=${operator}\n`);
}

// On the shared devnet node we cannot allocate parties, so each new handle
// claims one from the batch the operator pre-granted us (SELKIE_PARTY_POOL=1).
// On LocalNet, where we are admin, this stays off and we allocate per handle.
const pool = process.env.SELKIE_PARTY_POOL === "1";
const wallet = new Wallet({ ledger, operator, pool });
const history = new History(process.env.SELKIE_HISTORY ?? join(here, "../../.data/history.jsonl"));

// Real token deposits: accept CC (Amulet) and cBTC transfers sent to a handle's
// own party. Each factory returns null unless its devnet credentials are set, so
// the app runs unchanged on LocalNet. Both share the same devnet node.
const tokens = [amuletParty(), cbtcParty()].filter(Boolean);

createApp({ wallet, config, history, tokens }).listen(config.port, () => {
  console.log(`Selkie on http://localhost:${config.port}`);
  console.log(`  operator: ${operator}`);
  console.log(`  X login:  ${config.x.clientId ? "configured" : "not configured (set X_CLIENT_ID)"}`);
  console.log(`  tokens:   ${tokens.length ? tokens.map((t) => t.asset).join(", ") + " (accepted at each handle's own party)" : "local assets only"}`);
  console.log(`  parties:  ${pool ? "pool (claim a pre-granted party per handle)" : "allocate per handle"}`);
  if (config.devLogin) console.log("  dev login: ENABLED at /auth/dev?handle=name");
});

// Accept incoming tokens for every handle on a timer, so a deposit lands on its
// own instead of waiting for someone to open the Deposit page.
const sweepMs = Number(process.env.SELKIE_SWEEP_MS ?? 8_000);
startSweeper({ wallet, tokens, history, intervalMs: sweepMs });
if (tokens.length) console.log(`  sweep:    every ${Math.round(sweepMs / 1000)}s`);
