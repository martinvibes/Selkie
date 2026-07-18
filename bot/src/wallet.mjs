// The Selkie wallet service: social handles in, ledger contracts out.
//
// Everything the bots do goes through here, so the X worker and the Telegram
// bot cannot drift apart. The headline behaviour lives in `ensureAccount`:
// paying a handle that has never touched crypto *creates* that wallet, so a
// recipient's first interaction is receiving money, not onboarding.

import { Ledger } from "./ledger.mjs";

export const ASSETS = ["CC", "USDCX", "CBTC", "CETH"];

/** "@Ada" / "ada" / " @ada " all mean the same wallet. */
export function normalizeHandle(handle) {
  return `@${String(handle).trim().replace(/^@+/, "").toLowerCase()}`;
}

/** Party hints must be alphanumeric-ish; "@ada" -> "selkie-x-ada". */
function partyHint(handle, platform) {
  return `selkie-${platform}-${normalizeHandle(handle).slice(1).replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export class Wallet {
  /**
   * @param {object} cfg
   * @param {Ledger} cfg.ledger
   * @param {string} cfg.operator - operator party id
   */
  constructor({ ledger, operator }) {
    this.ledger = ledger;
    this.operator = operator;
    this.accountTid = ledger.tid("Account", "Account");
    this.holdingTid = ledger.tid("Holding", "Holding");
    this.transferTid = ledger.tid("Transfer", "TransferInstruction");
  }

  key(handle) {
    return { _1: this.operator, _2: normalizeHandle(handle) };
  }

  /** Fetch an account by handle, or null if this handle has no wallet yet. */
  async findAccount(handle) {
    const res = await this.ledger.fetchByKey(this.accountTid, this.key(handle), [this.operator]);
    if (!res) return null;
    return { cid: res.contractId, owner: res.payload.owner, handle: res.payload.handle };
  }

  /**
   * Get the wallet for a handle, creating it if this is the first time we've
   * seen them. Auto-onboarding: no app, no seed phrase, no signup.
   * @returns {Promise<{cid: string, owner: string, handle: string, created: boolean}>}
   */
  async ensureAccount(handle, platform = "x") {
    const existing = await this.findAccount(handle);
    if (existing) return { ...existing, created: false };

    const norm = normalizeHandle(handle);
    const party = await this.ledger.allocateParty(partyHint(norm, platform));
    const owner = party.identifier;
    const res = await this.ledger.create(
      this.accountTid,
      { operator: this.operator, owner, handle: norm, platform },
      [this.operator, owner],
    );
    return { cid: res.contractId, owner, handle: norm, created: true };
  }

  /** All holdings for a handle's owner party. */
  async holdings(handle) {
    const acc = await this.findAccount(handle);
    if (!acc) return [];
    const res = await this.ledger.query([this.holdingTid], { owner: acc.owner }, [this.operator]);
    return res.map((c) => ({
      cid: c.contractId,
      asset: c.payload.asset,
      amount: Number(c.payload.amount),
    }));
  }

  /** Balance per asset, e.g. { CBTC: 0.75, USDCX: 20 }. */
  async balance(handle) {
    const hs = await this.holdings(handle);
    return hs.reduce((acc, h) => {
      acc[h.asset] = (acc[h.asset] ?? 0) + h.amount;
      return acc;
    }, {});
  }

  /**
   * Credit a wallet directly (deposit / faucet path). Creates the wallet if
   * the handle is new.
   */
  async deposit(handle, asset, amount, platform = "x") {
    const acc = await this.ensureAccount(handle, platform);
    const res = await this.ledger.exercise(
      this.accountTid,
      acc.cid,
      "Credit",
      { asset, amount: String(amount) },
      [this.operator],
    );
    return { account: acc, holdingCid: res.exerciseResult };
  }

  /**
   * Find one holding of `asset` worth at least `amount`, merging fragments
   * when change has split the balance across contracts.
   */
  async fundingHolding(handle, asset, amount) {
    const matching = (await this.holdings(handle)).filter((h) => h.asset === asset);
    const single = matching.find((h) => h.amount >= amount);
    if (single) return single.cid;

    const total = matching.reduce((sum, h) => sum + h.amount, 0);
    if (total < amount) {
      const err = new Error(`insufficient ${asset}: has ${total}, needs ${amount}`);
      err.code = "INSUFFICIENT_FUNDS";
      throw err;
    }
    // Merge fragments into one holding big enough to cover the payment.
    let [head, ...rest] = matching;
    let cid = head.cid;
    let running = head.amount;
    for (const frag of rest) {
      const res = await this.ledger.exercise(this.holdingTid, cid, "Merge", { otherCid: frag.cid }, [
        this.operator,
      ]);
      cid = res.exerciseResult;
      running += frag.amount;
      if (running >= amount) break;
    }
    return cid;
  }

  /**
   * "send 5 USDCX to @bayo" — the whole product in one call.
   * Debit and credit settle atomically inside Execute; the recipient's wallet
   * is created on the fly if they've never used Selkie.
   */
  async send({ from, to, asset, amount, memo = "", platform = "x" }) {
    const value = Number(amount);
    if (!ASSETS.includes(asset)) throw new Error(`unknown asset: ${asset}`);
    if (!(value > 0)) throw new Error("amount must be positive");

    const sender = await this.findAccount(from);
    if (!sender) {
      const err = new Error(`${normalizeHandle(from)} has no Selkie wallet yet`);
      err.code = "NO_SENDER_WALLET";
      throw err;
    }
    const recipient = await this.ensureAccount(to, platform);
    if (recipient.owner === sender.owner) throw new Error("cannot send to yourself");

    const holdingCid = await this.fundingHolding(from, asset, value);

    const instr = await this.ledger.create(
      this.transferTid,
      {
        operator: this.operator,
        sender: sender.owner,
        recipient: recipient.owner,
        asset,
        amount: String(value),
        memo,
      },
      [this.operator, sender.owner],
    );

    await this.ledger.exercise(
      this.transferTid,
      instr.contractId,
      "Execute",
      {
        senderAccCid: sender.cid,
        recipientAccCid: recipient.cid,
        holdingCid,
      },
      [this.operator],
    );

    return {
      from: sender.handle,
      to: recipient.handle,
      asset,
      amount: value,
      memo,
      onboarded: recipient.created,
    };
  }

  /**
   * Pay a list of handles the same amount each — the reward campaign flow.
   * Recipients who have never held crypto are onboarded as they're paid,
   * which is the whole reason unclaimed prizes go to zero.
   */
  async reward({ from, winners, asset, amountEach, memo = "reward", platform = "x" }) {
    const results = [];
    for (const winner of winners) {
      try {
        const r = await this.send({ from, to: winner, asset, amount: amountEach, memo, platform });
        results.push({ handle: r.to, ok: true, onboarded: r.onboarded });
      } catch (err) {
        results.push({ handle: normalizeHandle(winner), ok: false, error: err.message });
      }
    }
    return {
      paid: results.filter((r) => r.ok).length,
      onboarded: results.filter((r) => r.onboarded).length,
      failed: results.filter((r) => !r.ok),
      results,
    };
  }
}
