// Background token sweeper.
//
// Incoming CC and cBTC land as pending transfers at each handle's own party and
// wait there until Selkie accepts them. The Deposit page accepts on open, but
// most of the time you are looking at your balance, not that page — so a deposit
// would sit unclaimed until you happened to visit it. This runs on a timer over
// every claimed handle and every token, and accepts what is waiting, so money
// shows up on its own, wherever you are, the way receiving a payment should feel.

import { claimTokenFor } from "./deposits.mjs";

/**
 * One full pass: accept and credit whatever is waiting for every claimed handle,
 * across every token. A single (handle, token) failure is logged and skipped so
 * it cannot stop the rest. Returns what it swept, for logging and tests.
 */
export async function sweepAll({ wallet, tokens, history, log = console }) {
  const swept = [];
  for (const acc of await wallet.accounts()) {
    if (!acc.owner) continue;
    for (const token of tokens) {
      try {
        const claimed = await claimTokenFor({
          wallet,
          token,
          history,
          handle: acc.handle,
          party: acc.owner,
        });
        for (const c of claimed) {
          log.log?.(
            `swept ${c.asset}: +${c.amount} -> ${acc.handle} from ${String(c.sender).slice(0, 24)}... (${String(c.updateId).slice(0, 12)}...)`,
          );
          swept.push({ handle: acc.handle, ...c });
        }
      } catch (err) {
        // One handle/token failure must not stop the rest of the sweep.
        log.warn?.(`sweep ${token.asset} for ${acc.handle} failed: ${err.message}`);
      }
    }
  }
  return swept;
}

/**
 * Run sweepAll on a timer. Returns a handle with stop(). A no-op when no tokens
 * are configured (e.g. LocalNet).
 *
 * @param {object} cfg
 * @param {import('../../bot/src/wallet.mjs').Wallet} cfg.wallet
 * @param {import('../../bot/src/token.mjs').TokenParty[]} cfg.tokens
 * @param {object} cfg.history
 * @param {number} [cfg.intervalMs]
 * @param {Console} [cfg.log]
 * @returns {{stop: () => void}}
 */
export function startSweeper({ wallet, tokens = [], history, intervalMs = 8_000, log = console }) {
  if (!tokens.length) return { stop() {} };

  let running = false;
  const tick = async () => {
    // A slow sweep must not stack up behind the next tick.
    if (running) return;
    running = true;
    try {
      await sweepAll({ wallet, tokens, history, log });
    } catch (err) {
      log.warn?.(`sweep failed: ${err.message}`);
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
