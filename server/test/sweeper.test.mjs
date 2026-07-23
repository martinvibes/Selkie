// The background CC sweeper and the shared claim helper. The ledger is faked by
// a pending queue that drains as transfers are accepted, the way the real ledger
// consumes an instruction on accept. What matters: every claimed handle gets
// swept, one handle's failure doesn't sink the others, and a transfer is never
// taken (or credited) twice even when the endpoint and the sweeper race.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepAll, startCcSweeper } from "../src/sweeper.mjs";
import { claimCcFor } from "../src/deposits.mjs";

const silent = { log() {}, warn() {} };

// A CC client whose per-party queue drains on accept; accepting a cid twice
// fails, exactly as re-accepting a consumed instruction would on-ledger.
function fakeAmulet(pendingByParty) {
  const accepts = [];
  return {
    accepts,
    async pendingFor(party) {
      return [...(pendingByParty.get(party) ?? [])];
    },
    async acceptFor(party, cid) {
      const q = pendingByParty.get(party) ?? [];
      const i = q.findIndex((t) => t.cid === cid);
      if (i === -1) throw new Error(`already accepted: ${cid}`);
      q.splice(i, 1);
      accepts.push({ party, cid });
      return { updateId: `1220${cid}` };
    },
  };
}

function recorder() {
  const credited = [];
  const logged = [];
  return {
    credited,
    logged,
    wallet: {
      deposit: async (handle, asset, amount) => credited.push({ handle, asset, amount }),
    },
    history: {
      append: async (e) => {
        logged.push(e);
        return { id: `h${logged.length}`, ...e };
      },
    },
  };
}

test("sweepAll accepts and credits pending CC for every claimed handle", async () => {
  const pending = new Map([
    ["pA", [{ cid: "a1", sender: "s1::1220", amount: 25 }]],
    ["pB", [{ cid: "b1", sender: "s2::1220", amount: 4 }]],
  ]);
  const amulet = fakeAmulet(pending);
  const { wallet: w, history, credited, logged } = recorder();
  const wallet = {
    ...w,
    accounts: async () => [
      { owner: "pA", handle: "@ada" },
      { owner: "pB", handle: "@bayo" },
    ],
  };

  const swept = await sweepAll({ wallet, amulet, history, log: silent });

  assert.equal(swept.length, 2);
  assert.deepEqual(credited, [
    { handle: "@ada", asset: "CC", amount: 25 },
    { handle: "@bayo", asset: "CC", amount: 4 },
  ]);
  assert.deepEqual(
    amulet.accepts.map((a) => a.cid),
    ["a1", "b1"],
  );
  assert.equal(logged.length, 2);
  assert.ok(logged.every((e) => e.type === "deposit" && e.asset === "CC"));
  assert.equal(logged[0].to, "@ada");
  assert.equal(logged[0].memo, "deposit from Canton Coin");
});

test("sweepAll skips a failing handle and still sweeps the others", async () => {
  const pending = new Map([["pB", [{ cid: "b1", sender: "s2::1220", amount: 4 }]]]);
  const amulet = fakeAmulet(pending);
  const ok = amulet.pendingFor.bind(amulet);
  amulet.pendingFor = async (party) => {
    if (party === "pA") throw new Error("participant hiccup");
    return ok(party);
  };
  const { wallet: w, history, credited } = recorder();
  const wallet = {
    ...w,
    accounts: async () => [
      { owner: "pA", handle: "@ada" },
      { owner: "pB", handle: "@bayo" },
    ],
  };

  const swept = await sweepAll({ wallet, amulet, history, log: silent });

  assert.deepEqual(credited, [{ handle: "@bayo", asset: "CC", amount: 4 }]);
  assert.equal(swept.length, 1);
});

test("claimCcFor serialises one party so a racing claim can't double-take", async () => {
  const pending = new Map([["pA", [{ cid: "a1", sender: "s1::1220", amount: 25 }]]]);
  const amulet = fakeAmulet(pending);
  const { wallet, history, credited } = recorder();
  const args = { wallet, amulet, history, handle: "@ada", party: "pA" };

  // The Deposit page and the sweeper both go for the same party at once.
  const [one, two] = await Promise.all([claimCcFor(args), claimCcFor(args)]);

  assert.equal(one.length + two.length, 1, "only one of the racing claims took it");
  assert.equal(amulet.accepts.length, 1, "the transfer was accepted exactly once");
  assert.deepEqual(credited, [{ handle: "@ada", asset: "CC", amount: 25 }]);
});

test("startCcSweeper is a no-op when CC is off", () => {
  let touched = false;
  const wallet = {
    accounts: async () => {
      touched = true;
      return [];
    },
  };
  const sweeper = startCcSweeper({ wallet, amulet: null, history: {}, log: silent });
  sweeper.stop();
  assert.equal(touched, false, "no amulet means no ledger work at all");
});
