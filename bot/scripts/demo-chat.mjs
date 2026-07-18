// Replays a real conversation against a live sandbox: every line you see is a
// chat message going through the same parser, dispatch and ledger the Telegram
// bot uses. Nothing is mocked — each reply is backed by Canton contracts.
//
//   node scripts/demo-chat.mjs
//
// Requires a sandbox + JSON API (see test/wallet.integration.test.mjs).

import { Ledger } from "../src/ledger.mjs";
import { Wallet } from "../src/wallet.mjs";
import { handleCommand } from "../src/dispatch.mjs";

const BASE = process.env.SELKIE_JSON_API ?? "http://localhost:7575";
const PKG = process.env.SELKIE_PKG_ID;
if (!PKG) {
  console.error("SELKIE_PKG_ID is required (daml damlc inspect-dar --json ... | jq -r .main_package_id)");
  process.exit(1);
}

const run = Date.now().toString(36).slice(-4);
const ledger = new Ledger({
  baseUrl: BASE,
  secret: process.env.SELKIE_JWT_SECRET ?? "secret",
  ledgerId: process.env.SELKIE_LEDGER_ID ?? "sandbox",
  pkgId: PKG,
});

const operatorParty = await ledger.allocateParty(`selkie-demo-${run}`);
const wallet = new Wallet({ ledger, operator: operatorParty.identifier });

const dara = `dara${run}`;
const winner = (i) => `fan${i}_${run}`;

const say = async (from, text) => {
  console.log(`\n\x1b[36m${from}:\x1b[0m ${text}`);
  const reply = await handleCommand({ wallet, from, text, platform: "telegram" });
  if (reply) console.log(`\x1b[32mselkie:\x1b[0m ${reply.split("\n").join("\n        ")}`);
};

console.log("\x1b[1m--- Selkie: a community manager runs a payout ---\x1b[0m");

// Dara funds her campaign wallet (deposit path stands in for a real on-ramp).
await wallet.deposit(dara, "CC", 500);
console.log(`\n(deposited 500 CC into @${dara}'s wallet)`);

await say(dara, "balance");
await say(dara, `send 25 CC to @${winner(1)} thanks for the best meme`);

console.log("\n\x1b[1m--- the winner opens Telegram for the first time ---\x1b[0m");
await say(winner(1), "balance");

console.log("\n\x1b[1m--- 20-winner campaign, none of them own a wallet ---\x1b[0m");
const winners = Array.from({ length: 20 }, (_, i) => winner(i + 100));
const t0 = Date.now();
const res = await wallet.reward({
  from: dara,
  winners,
  asset: "CC",
  amountEach: 5,
  memo: "quest winners",
  platform: "telegram",
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`\npaid:       ${res.paid}/${winners.length}`);
console.log(`onboarded:  ${res.onboarded} (had no wallet before this payment)`);
console.log(`unclaimed:  ${res.failed.length}`);
console.log(`took:       ${secs}s`);

const check = await wallet.balance(winners[7]);
console.log(`\nspot-check @${winners[7]}: ${JSON.stringify(check)}`);
console.log(`@${dara} remaining: ${JSON.stringify(await wallet.balance(dara))}`);
console.log("\n\x1b[1mEvery balance above is private: only the owner, the counterparty");
console.log("and the operator can see it. On a transparent chain it would be a public feed.\x1b[0m");
