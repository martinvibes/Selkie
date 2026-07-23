// Pool assignment and platform namespacing, tested against an in-memory ledger.
//
// The live wallet.integration test proves the allocate-per-handle path on real
// Canton. This one proves the shared-node behaviour that has no LocalNet
// equivalent: claiming parties from a pre-granted pool, and keeping @bayo-on-X
// and @bayo-on-Telegram as two separate wallets. A fake ledger keeps it fast
// and deterministic — it models exactly what Wallet touches, nothing more.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Wallet } from "../src/wallet.mjs";

class FakeLedger {
  constructor({ acts = [], local = () => true } = {}) {
    this.pkgId = "pkg";
    this.pkgName = "selkie";
    this.store = [];
    this.seq = 0;
    this.acts = acts;
    this.local = local;
    this.allocated = [];
  }
  tid(m, t) {
    return `${this.pkgId}:Selkie.${m}:${t}`;
  }
  nameTid(id) {
    return id.replace(/^[^:]+:/, `#${this.pkgName}:`);
  }
  #cid() {
    return `c${++this.seq}`;
  }
  async myActAsParties() {
    return [...this.acts];
  }
  async partyIsLocal(p) {
    return this.local(p);
  }
  async allocateParty(hint) {
    const identifier = `${hint}::alloc`;
    this.allocated.push(identifier);
    this.acts.push(identifier);
    return { identifier };
  }
  async grantActAs() {}
  async query(tids, match = {}) {
    const set = new Set(tids);
    const wanted = Object.entries(match);
    return this.store
      .filter((c) => set.has(c.templateId))
      .filter((c) => wanted.every(([k, v]) => c.payload?.[k] === v))
      .map((c) => ({ contractId: c.contractId, payload: c.payload }));
  }
  async queryOne(tids, match) {
    return (await this.query(tids, match))[0] ?? null;
  }
  async create(templateId, payload) {
    const contractId = this.#cid();
    this.store.push({ contractId, templateId, payload });
    return { contractId, payload };
  }
  async submit(commands) {
    const events = [];
    for (const cmd of commands) {
      if (cmd.CreateCommand) {
        const { templateId, createArguments } = cmd.CreateCommand;
        const contractId = this.#cid();
        this.store.push({ contractId, templateId, payload: createArguments });
        events.push({ CreatedEvent: { templateId, contractId, createArgument: createArguments } });
      } else if (cmd.ExerciseCommand?.choice === "RegisterHandle") {
        const { templateId, contractId, choiceArgument } = cmd.ExerciseCommand;
        const idx = this.store.findIndex((c) => c.contractId === contractId);
        const dir = this.store[idx];
        const handles = dir.payload.handles ?? [];
        // The directory is what enforces one wallet per key. A duplicate key
        // is rejected here, exactly as the on-ledger assertMsg would.
        assert.ok(!handles.includes(choiceArgument.handle), "duplicate handle must be rejected");
        this.store.splice(idx, 1);
        const newCid = this.#cid();
        this.store.push({
          contractId: newCid,
          templateId,
          payload: { ...dir.payload, handles: [choiceArgument.handle, ...handles] },
        });
      }
    }
    return { events };
  }
}

const OP = "operator::1220";
const poolWallet = (opts) => {
  const ledger = new FakeLedger(opts);
  return { ledger, wallet: new Wallet({ ledger, operator: OP, pool: true }) };
};

test("pool: a new handle claims the first free hosted party", async () => {
  const { wallet } = poolWallet({ acts: [OP, "selkie-pool-01::x", "selkie-pool-02::x"] });
  const a = await wallet.ensureAccount("bayo", "x");
  assert.equal(a.created, true);
  assert.equal(a.owner, "selkie-pool-01::x");
  assert.equal(a.handle, "@bayo");
});

test("pool: the next handle takes the next free party, never a taken one", async () => {
  const { wallet } = poolWallet({ acts: [OP, "selkie-pool-01::x", "selkie-pool-02::x"] });
  const a = await wallet.ensureAccount("bayo", "x");
  const b = await wallet.ensureAccount("cleo", "x");
  assert.equal(a.owner, "selkie-pool-01::x");
  assert.equal(b.owner, "selkie-pool-02::x");
});

test("pool: signing in again returns the same wallet, not a new one", async () => {
  const { wallet } = poolWallet({ acts: [OP, "selkie-pool-01::x", "selkie-pool-02::x"] });
  const first = await wallet.ensureAccount("bayo", "x");
  const again = await wallet.ensureAccount("bayo", "x");
  assert.equal(again.created, false);
  assert.equal(again.owner, first.owner);
});

test("pool: @bayo on X and @bayo on Telegram are separate wallets", async () => {
  const { wallet } = poolWallet({ acts: [OP, "selkie-pool-01::x", "selkie-pool-02::x"] });
  const x = await wallet.ensureAccount("bayo", "x");
  const tg = await wallet.ensureAccount("bayo", "telegram");
  assert.notEqual(x.owner, tg.owner);
  assert.equal((await wallet.findAccount("bayo", "x")).owner, x.owner);
  assert.equal((await wallet.findAccount("bayo", "telegram")).owner, tg.owner);
  // Cross-surface isolation: looking up the X wallet never returns the TG one.
  assert.notEqual(
    (await wallet.findAccount("bayo", "x")).owner,
    (await wallet.findAccount("bayo", "telegram")).owner,
  );
});

test("pool: a granted-but-unhosted party is skipped", async () => {
  const { wallet } = poolWallet({
    acts: [OP, "selkie-x-ben::x", "selkie-pool-02::x"],
    local: (p) => !p.startsWith("selkie-x-ben"),
  });
  const a = await wallet.ensureAccount("bayo", "x");
  assert.equal(a.owner, "selkie-pool-02::x");
});

test("pool: exhaustion is a clean, coded error", async () => {
  const { wallet } = poolWallet({ acts: [OP, "selkie-pool-01::x"] });
  await wallet.ensureAccount("bayo", "x"); // takes the only slot
  await assert.rejects(() => wallet.ensureAccount("cleo", "x"), (err) => {
    assert.equal(err.code, "POOL_EXHAUSTED");
    return true;
  });
});

test("pool: poolStatus counts hosted, taken and free", async () => {
  const { wallet } = poolWallet({
    acts: [OP, "selkie-pool-01::x", "selkie-pool-02::x", "selkie-x-ben::x"],
    local: (p) => !p.startsWith("selkie-x-ben"),
  });
  await wallet.ensureAccount("bayo", "x");
  const s = await wallet.poolStatus();
  assert.equal(s.total, 3); // operator excluded
  assert.equal(s.hosted, 2); // ben not hosted
  assert.equal(s.taken, 1); // bayo
  assert.equal(s.free, 1); // one hosted slot left
});

test("allocate mode (LocalNet): a handle still derives its own party", async () => {
  const ledger = new FakeLedger({ acts: [OP] });
  const wallet = new Wallet({ ledger, operator: OP, pool: false });
  const a = await wallet.ensureAccount("bayo", "x");
  assert.equal(a.owner, "selkie-x-bayo::alloc");
  assert.deepEqual(ledger.allocated, ["selkie-x-bayo::alloc"]);
});
