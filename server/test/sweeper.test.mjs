// The background token sweeper and the shared claim helper. The ledger is faked
// by a pending queue that drains as transfers are accepted, the way the real
// ledger consumes an instruction on accept. What matters: every claimed handle
// gets swept across every token, one handle/token failure doesn't sink the rest,
// and a transfer is never taken (or credited) twice even when the endpoint and
// the sweeper race.

import { test } from "node:test";
import assert from "node:assert/strict";
import { sweepAll, startSweeper } from "../src/sweeper.mjs";
import { claimTokenFor } from "../src/deposits.mjs";

const silent = { log() {}, warn() {} };

// A token client whose per-party queue drains on accept; accepting a cid twice
// fails, exactly as re-accepting a consumed instruction would on-ledger.
function fakeToken(asset, label, pendingByParty) {
  const accepts = [];
  return {
    asset,
    label,
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

test("sweepAll accepts and credits every token for every claimed handle", async () => {
  const cc = fakeToken(
    "CC",
    "Canton Coin",
    new Map([["pA", [{ cid: "a1", sender: "s1::1220", amount: 25 }]]]),
  );
  const cbtc = fakeToken(
    "CBTC",
    "cBTC",
    new Map([
      ["pA", [{ cid: "a2", sender: "s3::1220", amount: 0.5 }]],
      ["pB", [{ cid: "b1", sender: "s2::1220", amount: 0.1 }]],
    ]),
  );
  const { wallet: w, history, credited, logged } = recorder();
  const wallet = {
    ...w,
    accounts: async () => [
      { owner: "pA", handle: "@ada" },
      { owner: "pB", handle: "@bayo" },
    ],
  };

  const swept = await sweepAll({ wallet, tokens: [cc, cbtc], history, log: silent });

  assert.equal(swept.length, 3);
  assert.deepEqual(credited, [
    { handle: "@ada", asset: "CC", amount: 25 },
    { handle: "@ada", asset: "CBTC", amount: 0.5 },
    { handle: "@bayo", asset: "CBTC", amount: 0.1 },
  ]);
  assert.deepEqual(cc.accepts.map((a) => a.cid), ["a1"]);
  assert.deepEqual(cbtc.accepts.map((a) => a.cid), ["a2", "b1"]);
  assert.equal(logged.length, 3);
  assert.ok(logged.every((e) => e.type === "deposit"));
  assert.equal(logged[0].memo, "deposit from Canton Coin");
  assert.equal(logged[1].memo, "deposit from cBTC");
});

test("sweepAll skips a failing handle/token and still sweeps the rest", async () => {
  const cbtc = fakeToken("CBTC", "cBTC", new Map([["pB", [{ cid: "b1", sender: "s2::1220", amount: 4 }]]]));
  const ok = cbtc.pendingFor.bind(cbtc);
  cbtc.pendingFor = async (party) => {
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

  const swept = await sweepAll({ wallet, tokens: [cbtc], history, log: silent });

  assert.deepEqual(credited, [{ handle: "@bayo", asset: "CBTC", amount: 4 }]);
  assert.equal(swept.length, 1);
});

test("claimTokenFor serialises one party so a racing claim can't double-take", async () => {
  const token = fakeToken("CC", "Canton Coin", new Map([["pA", [{ cid: "a1", sender: "s1::1220", amount: 25 }]]]));
  const { wallet, history, credited } = recorder();
  const args = { wallet, token, history, handle: "@ada", party: "pA" };

  // The Deposit page and the sweeper both go for the same party at once.
  const [one, two] = await Promise.all([claimTokenFor(args), claimTokenFor(args)]);

  assert.equal(one.length + two.length, 1, "only one of the racing claims took it");
  assert.equal(token.accepts.length, 1, "the transfer was accepted exactly once");
  assert.deepEqual(credited, [{ handle: "@ada", asset: "CC", amount: 25 }]);
});

test("startSweeper is a no-op when no tokens are configured", () => {
  let touched = false;
  const wallet = {
    accounts: async () => {
      touched = true;
      return [];
    },
  };
  const sweeper = startSweeper({ wallet, tokens: [], history: {}, log: silent });
  sweeper.stop();
  assert.equal(touched, false, "no tokens means no ledger work at all");
});
