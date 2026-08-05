# Co-marketing proposals — Selkie × BOT Chain

Prepared 2026-08-04, in response to BOT Chain asking for co-marketing ideas.

## Paste-ready reply (short version)

```
Yes — and I think we can do better than an announcement swap,
because Selkie's product is itself a distribution mechanism.
Every payment publicly names a wallet that didn't exist a
second earlier.

1. THE ZERO-CLAIM AIRDROP
Run one BOT Chain reward round through Selkie instead of a claim
page. People reply with their handle and get paid — if they have
no wallet, the payment creates it. No claim step, nothing
unclaimed.

Airdrops normally lose 20-40% at the claim step. Our last
campaign: 20/20 paid, 20 wallets created, 0 unclaimed. Run it
both ways and we publish the comparison together — that's data
BOT Chain owns, not promotion.

2. "AN AGENT JUST PAID A HUMAN WITH NO WALLET"
A small agent on BOT Chain paying bounties to X handles, recorded
end to end. Agents can pay contracts but can't onboard people —
that's the open gap in the AI-native thesis, and I think this
closes it first.

3. "YOUR @HANDLE IS A BOT CHAIN WALLET"
Co-branded launch at deployment, with a live window where anyone
replying gets paid on the spot. People don't read about it, they
watch strangers get paid in the replies.

#1 can run before the port is finished — so co-marketing doesn't
have to wait on engineering. I'd also gladly run a Nigeria-first
activation; that's reach I suspect you don't have much of yet.

Which direction interests you?
```

**The framing that should run through every conversation:** most ecosystem
projects can offer BOT Chain a tweet. Selkie can offer a campaign in which the
marketing *is* the product demo, and which produces a publishable metric BOT
Chain owns. Every Selkie payment publicly names a wallet that did not exist a
second earlier — distribution is a side effect of the product working.

Ordered by strength. Lead with #1.

---

## 1 · The Zero-Claim Airdrop  ← lead with this

**What happens.** BOT Chain runs one community reward round through Selkie
instead of through a claim page. Recipients reply with, or are named by, their
X or Telegram handle. Selkie settles to each handle directly — creating the
wallet for anyone who does not have one — so there is no claim step, no
deadline, and no unclaimed remainder.

**What BOT Chain gets that they cannot get elsewhere.** A claim-rate number.
Standard airdrops lose 20–40% of value at the claim step. Selkie's documented
result is a 20-winner campaign with 20/20 paid, 20/20 wallets created and 0
unclaimed. Run both and publish the delta:

> "We ran the same reward two ways. Claim page: N% collected.
>  @SelkiePay: 100% collected, and X new wallets created."

That is original data, not promotion — which is exactly the kind of content
that spreads on its own and that an L1's marketing team actually wants. BOT
Chain becomes the chain that solved airdrop leakage, and Selkie is why.

**Why it is the right lead.** It serves BOT Chain's interest before Selkie's,
it is measurable, and the metric it produces is the same metric Option C is
scored on. Every recipient is a funded account.

---

## 2 · "An agent just paid a human who has no wallet"

**What happens.** A minimal agent running on BOT Chain pays out task bounties
to X handles automatically — no addresses, no onboarding, no claim. Recorded
or livestreamed end to end: agent decides, agent pays, a human with no wallet
receives money, wallet exists.

**Why it lands.** BOT Chain's entire positioning is AI-native infrastructure
for autonomous agents. The unresolved gap in that story is the human edge:
agents can pay contracts, but they cannot onboard people. This demo closes it
publicly and gives them a genuine narrative first — *agent-to-human payment*
as a category, demonstrated rather than described.

It is also the single most quotable artifact either side could produce during
the campaign, and it belongs to BOT Chain's thesis, not just Selkie's product.

---

## 3 · "Your @handle is a BOT Chain wallet"

**What happens.** A co-branded launch moment when native deployment ships. One
line, one command, one card. BOT Chain amplifies; Selkie runs a live window
where anyone replying to the announcement gets paid on the spot and watches
their wallet come into existence in the replies.

**Why it works.** The tagline is the product spec. Onlookers do not read about
the feature, they watch strangers receive money in a public thread. Scroll-past
becomes participation.

**Pair it with:** a Twitter Space or Telegram AMA on the same day — "why
onboarding is the last unsolved problem in agent payments" — so the launch has
a conversation attached rather than being a single post.

---

## 4 · Nigeria / emerging-market activation

**What happens.** A regional community push — Lagos-first — running Selkie
payouts inside existing Nigerian crypto and creator communities on Telegram.

**Why offer it.** This is reach BOT Chain most likely does not have, and it
costs them nothing to gain. Selkie's target user owns a phone and a handle, not
a hardware wallet, and near-zero fees are what make sub-dollar payments work in
that market at all. It gives BOT Chain a genuine emerging-market foothold and a
user profile that is structurally sticky, rather than mercenary liquidity that
leaves when incentives stop.

Position this as the *strategic* option: slower than a viral thread, but it
builds a user base that persists past the campaign.

---

## 5 · Smaller, low-effort add-ons

- **Handle-drop to BOT Chain's own followers.** "Reply with your handle" instead
  of "fill this form." Instant demonstration, zero infrastructure on their side.
- **Tip-enabled ecosystem.** Any BOT Chain project can tip contributors by handle
  from day one, with no wallet collection.
- **Build-in-public series.** Weekly posts on porting six contracts to Solidity —
  useful developer content for their ecosystem, and it keeps the integration
  visible for weeks rather than one launch day.
- **Case study on the BOT Chain blog.** Written up properly, this is the artifact
  that outlives the campaign and does recruiting work for both sides.

---

## Sequencing — what can run when

| Phase | Runs | Depends on |
| --- | --- | --- |
| Now, pre-deployment | #1 Zero-Claim Airdrop (on Canton), build-in-public series | Nothing — works today |
| At deployment | #3 launch moment, handle-drop, AMA | Native BOT Chain contracts |
| Post-deployment | #2 agent demo, #4 Nigeria activation, case study | Deployment + agent API |

Idea #1 can run **before** the port is finished, which is the point worth
making to them: co-marketing does not have to wait on engineering, and a
successful round pre-deployment de-risks the grant decision itself.

---

## Operational limit — read before agreeing to anything

Every idea above drives strangers into the live bots, and **the X and Telegram
workers currently run as one Node process on a laptop.** They are not deployed
and not redundant. A campaign that goes well is precisely the scenario that
breaks them, and a co-marketing push that 404s in public with BOT Chain's
audience watching is worse than no campaign at all.

Before agreeing to a date:

1. **Deploy the bot process** to Railway alongside the API. This is the single
   highest-value engineering task in front of the grant, and it is small.
2. **Cap each wave.** 50–100 recipients per window, announced as a window
   ("next 60 minutes") rather than open-ended. X polling runs on a 30s cycle
   and is rate-limited, so a burst queues rather than fails — but only if the
   volume is bounded.
3. **Fund the payout wallet in advance** and state the pool size publicly. A
   campaign that runs dry mid-thread reads as a rug, not a limit.
4. **Dry-run once** with a small internal group the day before.

Tell BOT Chain the cap up front. Publishing "first 100 replies" reads as
deliberate scarcity and creates urgency; running out unannounced reads as
failure. The constraint becomes a marketing asset if you name it first.
