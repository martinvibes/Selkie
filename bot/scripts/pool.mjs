// Party-pool operations for the shared devnet node.
//
//   (set -a; . bot/.env; . bot/.env.devnet; set +a; node bot/scripts/pool.mjs status)
//   (set -a; . bot/.env; . bot/.env.devnet; set +a; node bot/scripts/pool.mjs reset --yes)
//
// On the shared node we cannot allocate parties, so the operator grants us a
// pool and every handle that signs in claims a free one. `status` shows how
// many wallets are open and how many are still available. `reset` archives the
// Selkie accounts (and their holdings) on the pool parties so the slots free up
// again — for clearing demo/test wallets before a fresh run. It never touches
// the operator's own party, so the cBTC reserve is left alone.

import { ledgerFromEnv } from "../src/ledger.mjs";
import { Wallet } from "../src/wallet.mjs";

const short = (p) => String(p).split("::")[0];
const line = (s = "") => console.log(s);

const operator = process.env.SELKIE_OPERATOR;
if (!operator) {
  console.error("SELKIE_OPERATOR is required (source bot/.env and bot/.env.devnet first).");
  process.exit(1);
}

const { ledger, live } = ledgerFromEnv();
const wallet = new Wallet({ ledger, operator, pool: true });
const [command = "status"] = process.argv.slice(2);

async function status() {
  const s = await wallet.poolStatus();
  line(`Selkie party pool  (${live ? "devnet" : "local"})`);
  line("=".repeat(48));
  line(`operator : ${short(s.operator)}`);
  line(`granted  : ${s.total}   hosted: ${s.hosted}   taken: ${s.taken}   free: ${s.free}`);
  line();
  for (const slot of s.slots) {
    const who = slot.taken ? `${slot.handle} (${slot.platform})` : "— free —";
    const host = slot.hosted ? "hosted" : "NOT hosted";
    line(`  ${short(slot.party).padEnd(20)} ${host.padEnd(11)} ${who}`);
  }
  line();
  line(
    s.free > 0
      ? `${s.free} wallet${s.free === 1 ? "" : "s"} available for new sign-ins.`
      : "No free wallets. Ask the node operator to host and grant more parties.",
  );
}

async function reset() {
  if (!process.argv.includes("--yes")) {
    line("This archives every Selkie account and holding on the pool parties.");
    line("Re-run with --yes to confirm:");
    line("  node bot/scripts/pool.mjs reset --yes");
    return;
  }

  const s = await wallet.poolStatus();
  const taken = s.slots.filter((slot) => slot.taken);
  if (!taken.length) return line("Nothing to reset: the pool is already clear.");

  for (const slot of taken) {
    // Burn the holdings first (operator + owner both sign a Holding), then
    // close the account. Order matters only cosmetically; both are archived.
    const holdings = await ledger.query([wallet.holdingTid], { owner: slot.party }, [operator]);
    for (const h of holdings) {
      await ledger.exercise(wallet.holdingTid, h.contractId, "Archive", {}, [operator, slot.party]);
    }
    const account = await wallet.accountByParty(slot.party);
    if (account) {
      await ledger.exercise(wallet.accountTid, account.cid, "CloseAccount", {}, [operator, slot.party]);
    }
    line(`cleared ${slot.handle} (${slot.platform}) on ${short(slot.party)} — ${holdings.length} holding(s)`);
  }
  line();
  line(`Freed ${taken.length} wallet slot${taken.length === 1 ? "" : "s"}.`);
}

const commands = { status, reset };
const run = commands[command];
if (!run) {
  console.error(`unknown command: ${command} (use: status | reset)`);
  process.exit(1);
}
await run();
