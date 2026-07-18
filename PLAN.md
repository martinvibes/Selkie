# Selkie build plan (HackCanton S2)

8 days: Jul 18 to Jul 26 2026, submission 23:59 UTC on the 26th.

## Principles

1. **No mocks.** Every number shown to a user or a judge comes from a real
   Canton contract. Local sandbox for speed while building, DevNet for real.
2. **Ship the surface that nobody can block.** Anything gated on a third
   party's approval or invoice goes last, and the product must work without it.
3. **Commit as we build.** The cETH challenge disqualifies final-day code
   dumps, and the history is public anyway.

## User journey (built and tested first, everything else serves it)

```
1. Dara gets a wallet          -> deposit creates it
2. Dara sends 25 CC to @fan1   -> @fan1 has no wallet, the payment creates one
3. @fan1 checks balance        -> 25 CC, already theirs, no claim step
4. @fan1 sends onward          -> the loop continues
```

## X, split into two jobs

| Job | Cost | When |
|---|---|---|
| **Identity**: log in with X, claim your wallet, send to any @handle | free (OAuth 2.0) | core |
| **Command surface**: `@SelkiePay send 5 USDCX to @ada` in public replies | paid API tier | add-on |

The product is complete with identity alone. Mention monitoring is a viral
layer we bolt on, never a dependency. This removes our single biggest
operational risk.

## Phases

| Day | Phase | Gate |
|---|---|---|
| Jul 18 | Long-lead requests: cETH form, cBTC faucet, CC DevNet, BotFather token | human approvals, so they start first |
| Jul 19 | Telegram live: real payment from a phone | BotFather token |
| Jul 20 | DevNet: real CC, cBTC, cETH. cETH drives a state change | token faucets |
| Jul 21-23 | Frontend: X login, wallet claim, balances, send, history, deposit/withdraw | none |
| Jul 24 | Reward campaigns end to end, with paid/onboarded/unclaimed results | none |
| Jul 25 | Pilot payout with a real community (20+ recipients) + demo video | a willing community |
| Jul 26 | Six materials, diary, publish with buffer | Mana gate |

## Cut, deliberately

Prediction markets and the AI market maker. They dilute a demo the wallet
story already wins. Escrow, payment requests and splits stay in the ledger and
the README as depth, but get no UI time.

## Success metric

One real campaign, 20+ recipients, majority with no prior wallet, 100%
delivery, zero unclaimed. Provable on-ledger: every credit is a contract.

Local sandbox run on Jul 18 hit this already: 20/20 paid, 20/20 onboarded,
0 unclaimed, 9.2s. DevNet repeat is what makes it count.
