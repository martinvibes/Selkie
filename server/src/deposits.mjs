// Accepting incoming Canton Coin, in one place.
//
// A CC transfer sent to a handle lands as a pending instruction at that handle's
// own Canton party and sits there until Selkie accepts it. Two things trigger an
// accept: the Deposit page when you open it, and the background sweeper on its
// timer. Both call claimCcFor, so the accept-credit-log sequence lives here once
// and cannot drift between them.

// Per-party lock. The endpoint and the sweeper can both decide to accept the
// same party's transfers at the same instant; on-ledger only one accept wins and
// the other throws, but that throw would surface as a scary error for money that
// is actually fine. Serialising by party means the second caller simply sees an
// empty queue instead. Bounded by the number of live wallets, so it never grows
// without limit.
const chains = new Map();

function serializeByParty(party, fn) {
  const prev = chains.get(party) ?? Promise.resolve();
  // Run fn once prev settles either way; fn ignores the handoff value.
  const run = prev.then(fn, fn);
  // The chain must not carry fn's rejection forward to the next caller.
  chains.set(
    party,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

/**
 * Accept every Canton Coin transfer waiting at one handle's party, credit the
 * handle's Selkie balance 1:1, and log each as a deposit.
 *
 * @returns {Promise<Array<{asset:'CC',amount:number,sender:string,updateId:string,id:string}>>}
 */
export function claimCcFor({ wallet, amulet, history, handle, party }) {
  return serializeByParty(party, async () => {
    const claimed = [];
    for (const t of await amulet.pendingFor(party)) {
      // acceptFor consumes the on-ledger instruction, so the credit below can
      // run at most once per transfer: a replay finds nothing pending.
      const { updateId } = await amulet.acceptFor(party, t.cid);
      await wallet.deposit(handle, "CC", t.amount);
      const logged = await history.append({
        type: "deposit",
        from: t.sender,
        to: handle,
        asset: "CC",
        amount: t.amount,
        memo: "deposit from Canton Coin",
        onboarded: false,
      });
      claimed.push({ asset: "CC", amount: t.amount, sender: t.sender, updateId, id: logged.id });
    }
    return claimed;
  });
}
