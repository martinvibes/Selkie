// Background Canton Coin sweeper.
//
// Incoming CC lands as a pending transfer at each handle's own party and waits
// there until Selkie accepts it. The Deposit page accepts on open, but most of
// the time you are looking at your balance, not that page — so a deposit would
// sit unclaimed until you happened to visit it. This runs on a timer over every
// claimed handle and accepts what is waiting, so money shows up on its own,
// wherever you are, the way receiving a payment should feel.

import { claimCcFor } from "./deposits.mjs";

/**
 * One full pass: accept and credit whatever Canton Coin is waiting for every
 * claimed handle. A single handle's failure is logged and skipped so it cannot
 * stop the rest. Returns what it swept, for logging and tests.
 */
export async function sweepAll({ wallet, amulet, history, log = console }) {
  const swept = [];
  for (const acc of await wallet.accounts()) {
    if (!acc.owner) continue;
    try {
      const claimed = await claimCcFor({
        wallet,
        amulet,
        history,
        handle: acc.handle,
        party: acc.owner,
      });
      for (const c of claimed) {
        log.log?.(
          `CC swept: +${c.amount} -> ${acc.handle} from ${String(c.sender).slice(0, 24)}... (${String(c.updateId).slice(0, 12)}...)`,
        );
        swept.push({ handle: acc.handle, ...c });
      }
    } catch (err) {
      // One handle's failure must not stop the rest of the sweep.
      log.warn?.(`CC sweep for ${acc.handle} failed: ${err.message}`);
    }
  }
  return swept;
}

/**
 * Run sweepAll on a timer. Returns a handle with stop(). A no-op when CC is off.
 *
 * @param {object} cfg
 * @param {import('../../bot/src/wallet.mjs').Wallet} cfg.wallet
 * @param {object|null} cfg.amulet - the CC client, or null when CC is off
 * @param {object} cfg.history
 * @param {number} [cfg.intervalMs]
 * @param {Console} [cfg.log]
 * @returns {{stop: () => void}}
 */
export function startCcSweeper({ wallet, amulet, history, intervalMs = 10_000, log = console }) {
  if (!amulet) return { stop() {} };

  let running = false;
  const tick = async () => {
    // A slow sweep must not stack up behind the next tick.
    if (running) return;
    running = true;
    try {
      await sweepAll({ wallet, amulet, history, log });
    } catch (err) {
      log.warn?.(`CC sweep failed: ${err.message}`);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  // Don't let the sweep timer hold the process open on its own.
  if (typeof timer.unref === "function") timer.unref();
  // Run once at boot so anything already waiting doesn't sit for a full interval.
  void tick();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
