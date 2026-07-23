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

/**
 * The uniqueness key a handle registers under, namespaced by platform.
 *
 * "@bayo" on X and "@bayo" on Telegram are different people in different
 * namespaces, so they must be different wallets — signing in on one surface
 * can never reach into the other. The directory enforces one wallet per key,
 * so the key carries the platform. The Account still stores the bare "@bayo"
 * for display; only the registry key is qualified.
 */
function regKey(handle, platform) {
  return `${platform}:${normalizeHandle(handle)}`;
}

export class Wallet {
  /**
   * @param {object} cfg
   * @param {Ledger} cfg.ledger
   * @param {string} cfg.operator - operator party id
   * @param {boolean} [cfg.pool] - assign wallets from a pre-granted party pool
   *   instead of allocating one per handle. On a shared node we cannot allocate
   *   parties, so the operator grants us a batch and each new handle claims a
   *   free one. On a node we run (LocalNet) this stays off and we allocate.
   */
  constructor({ ledger, operator, pool = false }) {
    this.ledger = ledger;
    this.operator = operator;
    this.pool = pool;
    this.accountTid = ledger.tid("Account", "Account");
    this.directoryTid = ledger.tid("Account", "AccountDirectory");
    this.holdingTid = ledger.tid("Holding", "Holding");
    this.transferTid = ledger.tid("Transfer", "TransferInstruction");
    this.requestTid = ledger.tid("Request", "PaymentRequest");
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

  /**
   * Fetch an account by handle, or null if this handle has no wallet yet.
   * Scoped to a platform: the same handle on X and on Telegram are separate
   * wallets, so a lookup names which one it means (default X, the web surface).
   */
  async findAccount(handle, platform = "x") {
    const norm = normalizeHandle(handle);
    const acc = await this.ledger.queryOne(
      [this.accountTid],
      { operator: this.operator, handle: norm, platform },
      [this.operator],
    );
    if (!acc) return null;
    return { cid: acc.contractId, owner: acc.payload.owner, handle: acc.payload.handle };
  }

  /** Fetch an account by its party, for contracts that name parties not handles. */
  async accountByParty(party) {
    const acc = await this.ledger.queryOne(
      [this.accountTid],
      { operator: this.operator, owner: party },
      [this.operator],
    );
    if (!acc) return null;
    return { cid: acc.contractId, owner: acc.payload.owner, handle: acc.payload.handle };
  }

  /**
   * Every wallet we hold, as {cid, owner, handle, platform}. Used to sweep
   * incoming deposits across all handles at once, not just the signed-in one.
   */
  async accounts() {
    const rows = await this.ledger.query(
      [this.accountTid],
      { operator: this.operator },
      [this.operator],
    );
    return rows.map((a) => ({
      cid: a.contractId,
      owner: a.payload.owner,
      handle: a.payload.handle,
      platform: a.payload.platform,
    }));
  }

  /**
   * Get the wallet for a handle, creating it if this is the first time we've
   * seen them. Auto-onboarding: no app, no seed phrase, no signup.
   * @returns {Promise<{cid: string, owner: string, handle: string, created: boolean}>}
   */
  async ensureAccount(handle, platform = "x") {
    const existing = await this.findAccount(handle, platform);
    if (existing) return { ...existing, created: false };

    const norm = normalizeHandle(handle);
    // Two ways to get a party for a new handle. On a shared node we cannot
    // allocate, so we claim a free one from the pool the operator granted us;
    // on a node we run we allocate one named after the handle.
    const owner = this.pool
      ? await this.#claimPoolParty()
      : await this.ensureParty(partyHint(norm, platform));
    const dirCid = await this.directoryCid();

    // Register the handle and create its Account in ONE transaction. Canton 3
    // has no unique contract keys, so uniqueness comes from the directory:
    // two registrations of the same handle contend on the same contract and
    // one is rejected. Creating the Account in the same transaction means a
    // rejected registration cannot leave an orphan account behind. The registry
    // key is platform-qualified so @bayo can exist on both X and Telegram.
    const tx = await this.ledger.submit(
      [
        {
          ExerciseCommand: {
            templateId: this.directoryTid,
            contractId: dirCid,
            choice: "RegisterHandle",
            choiceArgument: { handle: regKey(norm, platform) },
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

  /** Parties we may act as that are already somebody's wallet. */
  async #boundParties() {
    return new Set((await this.accounts()).map((a) => a.owner));
  }

  /**
   * Take the next free party from the pool the operator granted us.
   *
   * A party is usable only if it is hosted here (isLocal) — a granted-but-
   * unhosted party accepts the grant yet fails every command — and free only if
   * no Account already owns it. We check "taken" before the network call so we
   * ask the participant about as few parties as possible.
   */
  async #claimPoolParty() {
    const granted = await this.ledger.myActAsParties();
    const taken = await this.#boundParties();
    for (const party of granted) {
      if (party === this.operator || taken.has(party)) continue;
      if (await this.ledger.partyIsLocal(party)) return party;
    }
    const err = new Error(
      "Selkie's wallet pool is full — every pre-granted party is in use. " +
        "Ask the node operator to host and grant more parties.",
    );
    err.code = "POOL_EXHAUSTED";
    throw err;
  }

  /**
   * A snapshot of the pool: which granted parties are hosted, which are taken
   * and by whom, and how many wallets are still available. Feeds the ops CLI
   * and answers "how many more people can sign up right now".
   */
  async poolStatus() {
    const granted = await this.ledger.myActAsParties();
    const accounts = await this.ledger.query(
      [this.accountTid],
      { operator: this.operator },
      [this.operator],
    );
    const byOwner = new Map(accounts.map((a) => [a.payload.owner, a.payload]));
    const slots = [];
    for (const party of granted) {
      if (party === this.operator) continue;
      const acc = byOwner.get(party);
      slots.push({
        party,
        hosted: await this.ledger.partyIsLocal(party),
        handle: acc?.handle ?? null,
        platform: acc?.platform ?? null,
        taken: Boolean(acc),
      });
    }
    return {
      operator: this.operator,
      total: slots.length,
      hosted: slots.filter((s) => s.hosted).length,
      taken: slots.filter((s) => s.taken).length,
      free: slots.filter((s) => s.hosted && !s.taken).length,
      slots,
    };
  }

  /** All holdings for a handle's owner party. */
  async holdings(handle, platform = "x") {
    const acc = await this.findAccount(handle, platform);
    if (!acc) return [];
    const res = await this.ledger.query([this.holdingTid], { owner: acc.owner }, [this.operator]);
    return res.map((c) => ({
      cid: c.contractId,
      asset: c.payload.asset,
      amount: Number(c.payload.amount),
    }));
  }

  /** Balance per asset, e.g. { CBTC: 0.75, USDCX: 20 }. */
  async balance(handle, platform = "x") {
    const hs = await this.holdings(handle, platform);
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
  async fundingHolding(handle, asset, amount, platform = "x") {
    const matching = (await this.holdings(handle, platform)).filter((h) => h.asset === asset);
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

    const sender = await this.findAccount(from, platform);
    if (!sender) {
      const err = new Error(`${normalizeHandle(from)} has no Selkie wallet yet`);
      err.code = "NO_SENDER_WALLET";
      throw err;
    }
    const recipient = await this.ensureAccount(to, platform);
    if (recipient.owner === sender.owner) throw new Error("cannot send to yourself");

    const holdingCid = await this.fundingHolding(from, asset, value, platform);

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
   * "request 10 USDCX from @chidi" — ask someone to pay you.
   *
   * A request moves no money on its own. It is a contract the payer can
   * approve, and approving settles the transfer atomically inside the same
   * choice, so there is no window where the request is accepted but the money
   * has not moved. Both wallets are created up front: you can ask someone who
   * has never used Selkie, and their wallet is waiting when they answer.
   */
  async requestPayment({ from, to, asset, amount, memo = "", platform = "x" }) {
    const value = Number(amount);
    if (!ASSETS.includes(asset)) throw new Error(`unknown asset: ${asset}`);
    if (!(value > 0)) throw new Error("amount must be positive");

    const requester = await this.ensureAccount(from, platform);
    const payer = await this.ensureAccount(to, platform);
    if (payer.owner === requester.owner) throw new Error("cannot request from yourself");

    const req = await this.ledger.create(
      this.requestTid,
      {
        operator: this.operator,
        requester: requester.owner,
        payer: payer.owner,
        asset,
        amount: String(value),
        memo,
      },
      [this.operator, requester.owner],
    );

    return {
      cid: req.contractId,
      from: requester.handle,
      to: payer.handle,
      asset,
      amount: value,
      memo,
      onboarded: payer.created,
    };
  }

  /**
   * Open requests for a handle, split by which side of them you are on.
   * `incoming` is money someone wants from you, `outgoing` is money you asked
   * for. The ledger only shows each party their own, which is the point.
   */
  async requests(handle, platform = "x") {
    const acc = await this.findAccount(handle, platform);
    if (!acc) return { incoming: [], outgoing: [] };

    const rows = await this.ledger.query([this.requestTid], {}, [this.operator]);
    const mine = { incoming: [], outgoing: [] };
    // Parties are what the contract stores; handles are what people read.
    const handles = new Map();
    const handleOf = async (party) => {
      if (!handles.has(party)) handles.set(party, (await this.accountByParty(party))?.handle ?? party);
      return handles.get(party);
    };

    for (const c of rows) {
      const side =
        c.payload.payer === acc.owner ? "incoming" : c.payload.requester === acc.owner ? "outgoing" : null;
      if (!side) continue;
      mine[side].push({
        cid: c.contractId,
        asset: c.payload.asset,
        amount: Number(c.payload.amount),
        memo: c.payload.memo ?? "",
        from: await handleOf(c.payload.requester),
        to: await handleOf(c.payload.payer),
      });
    }
    return mine;
  }

  /** Find one open request by contract id, or throw a caller-friendly error. */
  async #findRequest(cid) {
    const rows = await this.ledger.query([this.requestTid], {}, [this.operator]);
    const found = rows.find((c) => c.contractId === cid);
    if (!found) {
      const err = new Error("that request is no longer open");
      err.code = "NO_SUCH_REQUEST";
      throw err;
    }
    return found;
  }

  /**
   * Pay a request. The payer must be the party the request names, so an
   * approval from anyone else is refused before it reaches the ledger.
   */
  async approveRequest({ cid, payerHandle, platform = "x" }) {
    const req = await this.#findRequest(cid);
    const payer = await this.findAccount(payerHandle, platform);
    if (!payer || payer.owner !== req.payload.payer) {
      const err = new Error("that request is not addressed to you");
      err.code = "NOT_YOUR_REQUEST";
      throw err;
    }

    const requester = await this.accountByParty(req.payload.requester);
    if (!requester) throw new Error("the requester's wallet has gone missing");

    const asset = req.payload.asset;
    const amount = Number(req.payload.amount);
    const holdingCid = await this.fundingHolding(payerHandle, asset, amount, platform);

    await this.ledger.exercise(
      this.requestTid,
      cid,
      "Approve",
      {
        payerAccCid: payer.cid,
        requesterAccCid: requester.cid,
        holdingCid,
      },
      [this.operator, payer.owner],
    );

    return { from: payer.handle, to: requester.handle, asset, amount, memo: req.payload.memo ?? "" };
  }

  /** Turn a request down. Only the payer can. */
  async declineRequest({ cid, payerHandle, platform = "x" }) {
    const req = await this.#findRequest(cid);
    const payer = await this.findAccount(payerHandle, platform);
    if (!payer || payer.owner !== req.payload.payer) {
      const err = new Error("that request is not addressed to you");
      err.code = "NOT_YOUR_REQUEST";
      throw err;
    }
    await this.ledger.exercise(this.requestTid, cid, "Decline", {}, [this.operator, payer.owner]);
    return { asset: req.payload.asset, amount: Number(req.payload.amount) };
  }

  /** Take back a request you sent. Only the requester can. */
  async cancelRequest({ cid, requesterHandle, platform = "x" }) {
    const req = await this.#findRequest(cid);
    const requester = await this.findAccount(requesterHandle, platform);
    if (!requester || requester.owner !== req.payload.requester) {
      const err = new Error("that is not your request to cancel");
      err.code = "NOT_YOUR_REQUEST";
      throw err;
    }
    await this.ledger.exercise(this.requestTid, cid, "CancelRequest", {}, [
      this.operator,
      requester.owner,
    ]);
    return { asset: req.payload.asset, amount: Number(req.payload.amount) };
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
