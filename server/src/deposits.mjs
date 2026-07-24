// Accepting an incoming token deposit, in one place.
//
// A transfer sent to a handle lands as a pending instruction at that handle's
// own Canton party and sits there until Selkie accepts it. Two things trigger an
// accept: the Deposit page when you open it, and the background sweeper on its
// timer. Both call claimTokenFor, so the accept-credit-log sequence lives here
// once and cannot drift between them. It is the same for every token (CC, cBTC)
// because they share the CIP-56 accept interface.

// Per-party lock. The endpoint and the sweeper can both decide to accept a
// party's transfers at the same instant; on-ledger only one accept wins and the
// other throws, but that throw would surface as a scary error for money that is
// actually fine. Serialising by party means the second caller simply sees an
// empty queue instead — and it also keeps us from firing two ledger commands for
// the same party at once. Bounded by the number of live wallets.
const chains = new Map();

function serializeByParty(party, fn) {
  const prev = chains.get(party) ?? Promise.resolve();
  const run = prev.then(fn, fn);
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
 * Accept every waiting transfer of one token at one handle's party, credit the
 * handle's Selkie balance 1:1, and log each as a deposit.
 *
 * @param {object} args
 * @param {import('../../bot/src/wallet.mjs').Wallet} args.wallet
 * @param {import('../../bot/src/token.mjs').TokenParty} args.token
 * @param {object} args.history
 * @param {string} args.handle
 * @param {string} args.party
 * @returns {Promise<Array<{asset:string,amount:number,sender:string,updateId:string,id:string}>>}
 */
export function claimTokenFor({ wallet, token, history, handle, party }) {
  return serializeByParty(party, async () => {
    const claimed = [];
    for (const t of await token.pendingFor(party)) {
      // acceptFor consumes the on-ledger instruction, so the credit below runs
      // at most once per transfer: a replay finds nothing pending.
      const { updateId } = await token.acceptFor(party, t.cid);
      await wallet.deposit(handle, token.asset, t.amount);
      const logged = await history.append({
        type: "deposit",
        from: t.sender,
        to: handle,
        asset: token.asset,
        amount: t.amount,
        memo: `deposit from ${token.label}`,
        onboarded: false,
      });
      claimed.push({ asset: token.asset, amount: t.amount, sender: t.sender, updateId, id: logged.id });
    }
    return claimed;
  });
}
