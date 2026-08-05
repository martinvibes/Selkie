# BOT Chain Ecosystem Support & Incentive Program — Selkie application

Paste-ready answers. Every number here is checkable against the repo or a live
ledger, because §1 of the compliance notice makes all of it a warranty with a
12-month retroactive audit window and clawback rights. Bullish framing, zero
invented metrics — that combination is what survives a review.

Verified 2026-08-03 against the working tree.

---

## Email

`martinmachiebe21@gmail.com` — tick "Record my email".

---

## Project Name

```
Selkie
```

---

## Core Highlights *

```
Selkie turns any X or Telegram handle into a wallet. You pay someone by
replying to a bot with one line — "send 5 CC to @ada" — and if @ada has never
heard of Selkie, the payment itself creates her wallet inside the same atomic
transaction. Nothing to claim, nothing to install, no seed phrase, no address,
no gas.

WHY THIS MATTERS ON AN AI-NATIVE CHAIN

Agents cannot onboard humans. Every AI agent that has to pay a person — task
bounties, data labelling, referral payouts, RLHF work, affiliate splits — hits
the same wall: the recipient has no wallet, and no agent can walk them through
installing one and saving twelve words. Industry-wide, 20-40% of reward and
airdrop value is never claimed for exactly this reason. Selkie deletes the
claim step. An agent calls one endpoint with a handle; the human is paid
whether or not they have ever touched crypto. BOT Chain is building the
settlement layer for autonomous agents, and Selkie is the last mile from those
agents to actual people.

PROVEN, NOT PROMISED — all independently verifiable

- Live on Canton Network DevNet (Canton 3.5.9), built and shipped at
  HackCanton Season 2.
- A 20-winner reward campaign settled on a real public node: 20/20 paid,
  20/20 wallets created, 0 unclaimed. Every recipient had no wallet before
  the payment landed.
- Verified live on 4 Aug 2026 by direct query of the DevNet participant
  (ledger offset 511565): 81 active contracts, including 16 accounts each at
  its own distinct Canton party. Real token-standard assets held at external
  registrars: 1.9 cBTC and 5.5 cETH, accepted via TransferInstruction_Accept
  against the DA Utility Registry rather than minted as labels in our own
  contracts. One outbound token-standard transfer of 3.0 cETH from the
  operator party to an individual user's party proves the full path.
- 111 automated tests green against a live participant node, including a
  12-test live integration suite.
- Three live surfaces on one shared core: an X bot (@SelkiePay), a Telegram
  bot (@selkiepay_bot), and a web wallet — all routed through a single
  dispatch layer, so a new surface is a driver, not a rewrite.
- Payment requests are contracts, not messages. Asking moves nothing; the
  payer's approval is one transaction that creates and executes the transfer,
  so funds are never in limbo, and the ledger — not our server — enforces
  that only the named payer can approve.

WHAT WE BRING TO BOT CHAIN

Selkie's on-chain surface is deliberately small: 307 lines of contract code
across 6 templates (Account, Holding, Transfer, Request, Escrow, Rewards).
Everything above it — the bot workers, the dispatch core, custody and handle
resolution, the web app — is chain-agnostic Node.js and React that ports
unchanged. That means a native BOT Chain deployment is a focused Solidity
implementation of six well-specified contracts, not a rebuild, and we can
ship it fast because the hard part (the product, and proof that people
actually use it) is already done and running.

We would deploy those contracts natively on BOT Chain mainnet and make BOT
Chain the default settlement rail for all new Selkie users.

WHY BOT CHAIN SPECIFICALLY

Social payments are small payments. A $0.50 tip or a $2 bounty is economically
impossible on a chain where gas costs more than the payment delivers — this is
the single reason consumer crypto payments have never worked at scale. BOT
Chain's 0.75s blocks and near-zero fees are the first economics that make
sub-dollar handle-to-handle payments viable, and EVM compatibility means our
Solidity port ships in weeks rather than quarters. The AI-agent thesis is the
second half: agent-to-human payout is a category that does not exist yet, and
it cannot exist until the human side stops requiring a wallet.

MARKET

Emerging markets, Nigeria first. Our users do not own hardware wallets. They
own a phone and a social handle — and that is the entire account model.
```

> Trim note: if the field caps out, cut "WHY BOT CHAIN SPECIFICALLY" down to
> its first sentence and drop the "Payment requests are contracts" bullet.
> Never cut the "PROVEN, NOT PROMISED" block — that is the part that gets you
> read twice.

---

## Official Channels *

```
Project Website: https://selkiepay.vercel.app
Twitter (X) Link: https://x.com/SelkiePay
Telegram / Discord Link: https://t.me/selkiepay_bot
```

All three verified live (HTTP 200) on 2026-08-03.

> Consider creating a Telegram **group** as well and listing it alongside the
> bot. Reviewers assessing "community growth" look for a room with people in
> it; a bot DM link shows product but no community. If you make one, list it
> first and the bot second.

---

## Current Development Stage *

**Select: `Testnet Live`**

This is the honest and correct answer. Selkie runs on Canton DevNet — a real
shared public test network, not a local sandbox — with real token-standard
assets settled on it. Do not select Mainnet Live: nothing is on a mainnet, and
"natively deployed on BOT Chain mainnet" is a hard eligibility requirement for
Option B specifically, so a wrong claim here is checkable and fatal.

---

## Whitepaper / Pitch Deck *  — ACTION NEEDED

You have a real 6-slide deck already built at `/pitch`.

1. Open `https://selkiepay.vercel.app/pitch`
2. Click through all 6 slides once so everything renders
3. Print to PDF (Cmd+P → Save as PDF), landscape
4. Upload that PDF

If the deck's click-through navigation doesn't print cleanly, screenshot each
of the 6 slides and drop them into a single PDF via Preview. Either way, add a
final slide with the "PROVEN, NOT PROMISED" bullets above — a reviewer who
only opens the attachment should still see the evidence.

---

## GitHub Repository URL

```
https://github.com/martinvibes/Selkie
```

Verified public (HTTP 200). Also fill the contact GitHub ID: `martinvibes`

> Before submitting, check `README.md:98` — it still says `GET /api/reserve`
> "prints the reserve to anyone, no login required." That endpoint is now
> session-gated (`server/src/app.mjs:375` reads `session.handle`). It is a
> small thing, but this form promises a code review, and a reviewer who tests
> the one documented public endpoint and gets `{"error":"not signed in"}`
> starts doubting everything else. Fix the line or make the endpoint public
> again.

---

## Demo Video / Testnet Link

```
Live web wallet: https://selkiepay.vercel.app
Telegram bot (live now): https://t.me/selkiepay_bot — send "balance" or
  "send 5 CC to @ada"
X bot (live now): reply to https://x.com/SelkiePay with "send 5 CC to @ada"
Pitch deck: https://selkiepay.vercel.app/pitch

Anyone reviewing this can pay a handle themselves in under 60 seconds without
installing anything.
```

That last line is the strongest sentence in the whole application. Almost no
applicant can say it.

> Operational warning: the X and Telegram bots run as one Node process on your
> Mac, not a deployment. You are inviting reviewers to test a live bot — if
> the laptop sleeps, both surfaces die silently and the reviewer concludes the
> product is vapour. Run `caffeinate -dimsu` and leave it up for the whole
> review period, or deploy the bot process before you submit. Recording a
> 2-3 minute demo video (script already in `docs/demo-script.md`) is the
> safer play: it survives your laptop sleeping.

---

## Primary Receiving Wallet Address *  — YOU MUST SUPPLY THIS

I cannot generate this for you. BOT Chain is EVM-compatible, so this is a
standard `0x...` address.

- Use a **fresh** address you control, from MetaMask or a hardware wallet.
- The form says this is the **sole** address for all incentive distribution —
  so use one you will still control in a year, not a throwaway.
- Paste only the **public address**. No seed phrase, no private key. No
  legitimate grant program ever needs those, and this form does not ask for
  them.

## Backup / Associated Wallet Address

Optional — leave blank, or add a second address you control. Note the Sybil
rule: addresses sharing a funding source get discounted to 10%. Listing wallets
you funded from one place is not cheating, but do not list many.

---

## On-chain Interaction Records *  — DONE

**Upload `docs/botchain/selkie-onchain-records.pdf`** (4 pages, 207 KB, well
under the 10 MB cap). Also copied to `~/Downloads`.

Selkie has **zero BOT Chain on-chain history**, because Selkie has never
deployed there — and §1 makes fabricating any is a warranty breach with
permanent blacklisting and legal exposure. So nothing was manufactured. The
PDF instead contains a genuine, freshly-executed query.

The document leads with an unmissable scope box stating that Selkie has not
deployed to BOT Chain and that these are Canton DevNet records. Naming the gap
yourself converts your biggest weakness into a credibility signal: a reviewer
who catches you hiding it rejects you; one who sees you flag it unprompted
believes the rest of your numbers.

What it contains, all from a **live read-only query run 2026-08-04** against
the shared HackCanton DevNet participant at ledger offset **511565**:

1. Network, node, party ID, package ID and query timestamp
2. Live position: **1.9 cBTC + 5.5 cETH** held under CIP-56 at external
   registrars, and 81 active contracts broken down by template
3. All **16 on-ledger accounts**, each shown resolving to its own distinct
   Canton party — this is the per-user custody model, evidenced
4. Four settled token-standard transfers, including one **outbound 3.0 cETH**
   from the operator party to a user's own party
5. A verbatim raw ledger record, unedited
6. The four historical settlement update IDs
7. The exact three API calls to reproduce every figure, plus an open offer to
   grant read access or run the query live on a call

That last item is the strongest part. It converts the document from "trust our
screenshot" into "here is how to check us," which is precisely the posture the
anti-cheating notice is written to reward.

> Note on why there is no explorer link or Dune dashboard: Canton is
> privacy-preserving, so contracts are visible only to their stakeholders.
> There is no public explorer that can show a third party's holdings and no
> Dune dataset exists. The PDF states this explicitly in §1 so the absence
> reads as a property of the network rather than an evasion.

---

## Support Tier *

**Select: `Option C — Community Growth Support`**

C is the only tier Selkie is actually eligible for, and it is also the one
that genuinely fits:

- **Option A (DEX liquidity)** requires a token to provide liquidity for.
  Selkie has no token. Not applicable.
- **Option B (CEX listing)** requires a token *and* native mainnet deployment
  already in place. Not applicable.
- **Option C (Community Growth)** rewards active users, interaction frequency
  and TVL growth — which is precisely what a payments app produces. Selkie's
  entire growth mechanic is that every payment creates a new funded user, so
  active-user count is the metric we are already built to move.

> **Read this before you plan around C's economics.** A "valid user" under C
> must hold **≥ 0.1 BOT AND ≥ 100 USDT**, and you must sustain eligibility
> **25 days out of any 30**. That $100 floor per user directly contradicts a
> Nigeria-first consumer app — most of your natural users will never hold $100
> USDT, so they will not count as valid users no matter how real they are.
>
> This does not disqualify you and it is not a reason to skip applying: the
> gas rebate (up to 35%) and points rewards apply to all approved projects
> regardless. But go in clear-eyed that headline Option C rewards are tuned
> for DeFi-scale wallets, and plan your ask around the deployment support and
> rebates rather than assuming the community-growth payout will trigger. If
> there's a call with the incubation team, raise this directly — asking how
> a consumer payments app qualifies under a $100/user floor is a sharp
> question that marks you as someone who read the terms.

---

## Contact Name / Alias

```
Martin Machiebe
```

Use whatever name matches your GitHub and X presence — consistency across
GitHub, X and this form is itself a light identity check.

## Preferred Contact Method *

```
Telegram: @<your_personal_handle>  (primary, fastest response)
Email: martinmachiebe21@gmail.com
```

Fill in your personal Telegram handle — **not** @selkiepay_bot. This field is
for onboarding and contract signing; a bot cannot sign anything, and routing
the incubation team into your product bot loses you the conversation.

---

## Compliance Notice *

Tick all three. Read them properly first — they are real obligations, not
boilerplate:

- All submitted metrics are warranted true, with a **12-month retroactive
  audit** and clawback of already-distributed rewards.
- BOT Chain or third parties may run Sybil analysis, fund-flow tracing and
  **smart contract audits**.
- Penalties include permanent blacklisting, public disclosure of the
  violation, and legal action.

Everything drafted above is written to survive that audit. The single rule
going forward: if Selkie later reports user counts to this program, they must
be real humans, not addresses you funded. Under §2 Option C, addresses sharing
a funding source count at 10% — which means airdropping wallets to inflate
users would actively *reduce* your score while exposing you to clawback. The
honest path is also the higher-scoring one here.

---

## Submission checklist

| # | Item | Status |
|---|---|---|
| 1 | Project name, highlights, channels | Ready — copy from above |
| 2 | Stage = Testnet Live | Ready |
| 3 | Pitch deck PDF | **You must export from /pitch** |
| 4 | GitHub URL + ID | Ready (fix README:98 first) |
| 5 | Demo links | Ready (keep the Mac awake, or record video) |
| 6 | Primary wallet address | **You must supply an EVM 0x address** |
| 7 | On-chain records PDF | **You must build the Canton PDF** |
| 8 | Support tier = C | Ready |
| 9 | Contact = personal Telegram | **You must supply your handle** |
| 10 | Compliance boxes | Ready to tick |

Four items need you. The rest is paste-ready.

---

## One strategic note

This would be Selkie's **third** chain: shipped on Canton, an in-flight SCF
Integration Track application for Stellar (`docs/stellar-scf-strategy.md`),
and now a native BOT Chain deployment. Applying costs you an afternoon and is
clearly worth it. But a BOT Chain grant comes with a real commitment to
deploy, and your Stellar memo already identifies **traction** as the binding
constraint on that application — the same scarce hours feed both.

Worth deciding deliberately which one is the primary bet before a BOT Chain
call turns into a delivery date. Applying to both is fine; promising both the
same quarter is not.
