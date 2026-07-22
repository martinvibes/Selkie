#!/usr/bin/env node
// Operate Selkie's real cBTC reserve on Canton devnet.
//
//   node scripts/cbtc.mjs status          what we hold, what is pending
//   node scripts/cbtc.mjs accept          claim every pending faucet transfer
//   node scripts/cbtc.mjs send <party> <amount>
//
// Reads the SELKIE_CBTC_* environment; see docs/devnet.md.

import { cbtcFromEnv } from "../src/cbtc.mjs";

const cbtc = cbtcFromEnv();
if (!cbtc) {
  console.error("SELKIE_CBTC_* is not set; source bot/.env first");
  process.exit(1);
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "status" || cmd === undefined) {
  const [holdings, pending] = await Promise.all([cbtc.holdings(), cbtc.pending()]);
  console.log(`party      ${cbtc.party}`);
  console.log(`holdings   ${holdings.total} ${cbtc.instrument} (${holdings.unlocked} unlocked)`);
  for (const c of holdings.contracts) {
    console.log(`  ${c.amount}${c.locked ? "  [locked: in-flight]" : ""}  ${c.cid.slice(0, 24)}...`);
  }
  console.log(`pending    ${pending.length} incoming transfer(s)`);
  for (const p of pending) {
    console.log(`  ${p.amount} from ${p.sender.slice(0, 32)}...  ${p.cid.slice(0, 24)}...`);
  }
} else if (cmd === "accept") {
  const results = await cbtc.acceptAll();
  if (results.length === 0) console.log("nothing pending");
  for (const r of results) console.log(`accepted ${r.amount} -> update ${r.updateId}`);
} else if (cmd === "send") {
  const [receiver, amount] = args;
  if (!receiver || !amount) {
    console.error("usage: cbtc.mjs send <party-id> <amount>");
    process.exit(1);
  }
  const r = await cbtc.send({ receiver, amount: Number(amount) });
  console.log(`sent ${r.amount} ${cbtc.instrument} -> update ${r.updateId}`);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
