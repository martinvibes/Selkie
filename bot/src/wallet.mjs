// The Selkie wallet service: social handles in, ledger contracts out.
//
// Everything the bots do goes through here, so the X worker and the Telegram
// bot cannot drift apart. The headline behaviour lives in `ensureAccount`:
// paying a handle that has never touched crypto *creates* that wallet, so a
// recipient's first interaction is receiving money, not onboarding.
//
// Canton 3 shaped two things here. There are no unique contract keys, so a
// handle resolves to its Account by querying and by the AccountDirectory, not
// by key lookup. And on a shared node we cannot allocate parties, so a handle's
// party is discovered from the rights the operator granted us, not minted here.

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
    this.directoryTid = ledger.tid("Account", "AccountDirectory");
    this.holdingTid = ledger.tid("Holding", "Holding");
    this.transferTid = ledger.tid("Transfer", "TransferInstruction");
  }

  /**
   * Resolve the party for a handle.
   *
   * Prefer a party we already hold actAs on: on a shared node the operator
   * pre-creates the demo parties and grants us rights, and we are not allowed
   * to allocate our own. Only if none matches do we allocate one, which
   * succeeds on a node we run (LocalNet) and is refused on a shared one. The
   * grant travels with the allocation because a party we cannot act for is
   * useless for co-signing its account.
   */
  async ensureParty(hint) {
    const mine = await this.ledger.myActAsParties();
    const existing = mine.find((p) => String(p).split("::")[0] === hint);
    if (existing) return existing;

    try {
      const party = (await this.ledger.allocateParty(hint)).identifier;
      await this.ledger.grantActAs(party);
      return party;
    } catch (err) {
      const e = new Error(
        `no party for "${hint}" and cannot allocate one on this node; ` +
          `ask the node operator to create it and grant this user actAs`,
      );
      e.code = "NO_PARTY";
      e.cause = err;
      throw e;
    }
  }

  /**
   * The operator's AccountDirectory, created on first use.
   *
   * RegisterHandle consumes and recreates it, so its contract id changes on
   * every registration; callers must read it fresh rather than cache it.
   */
  async directoryCid() {
    const existing = await this.ledger.queryOne(
      [this.directoryTid],
      { operator: this.operator },
      [this.operator],
    );
    if (existing) return existing.contractId;
    const res = await this.ledger.create(
      this.directoryTid,
      { operator: this.operator, handles: [] },
      [this.operator],
    );
    return res.contractId;
  }

  /** Fetch an account by handle, or null if this handle has no wallet yet. */
  async findAccount(handle) {
    const norm = normalizeHandle(handle);
    const acc = await this.ledger.queryOne(
      [this.accountTid],
      { operator: this.operator, handle: norm },
      [this.operator],
    );
    if (!acc) return null;
    return { cid: acc.contractId, owner: acc.payload.owner, handle: acc.payload.handle };
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
    const owner = await this.ensureParty(partyHint(norm, platform));
    const dirCid = await this.directoryCid();

    // Register the handle and create its Account in ONE transaction. Canton 3
    // has no unique contract keys, so uniqueness comes from the directory:
    // two registrations of the same handle contend on the same contract and
    // one is rejected. Creating the Account in the same transaction means a
    // rejected registration cannot leave an orphan account behind.
    const tx = await this.ledger.submit(
      [
        {
          ExerciseCommand: {
            templateId: this.directoryTid,
            contractId: dirCid,
            choice: "RegisterHandle",
            choiceArgument: { handle: norm },
          },
        },
        {
          CreateCommand: {
            templateId: this.accountTid,
            createArguments: { operator: this.operator, owner, handle: norm, platform },
          },
        },
      ],
      [this.operator, owner],
    );
    // Exact match, not a substring: "Account:Account" is a prefix of
    // "Account:AccountDirectory", whose successor is created in this same
    // transaction, so a loose test would pick the wrong contract.
    const account = Ledger.created(tx).find((c) => c.templateId === this.accountTid);
    return { cid: account?.contractId, owner, handle: norm, created: true };
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
