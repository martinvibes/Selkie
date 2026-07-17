# Selkie 🦭

**Every handle has a hidden skin.** Selkie turns any X or Telegram account into a Canton wallet — send real Bitcoin (cBTC), ETH (cETH) and dollars (USDCx) with a single mention. No app. No seed phrase. No gas.

> `@SelkiePay send 5 USDCX to @lan` — that's the whole onboarding.

Named for the seal-folk of Celtic myth: ordinary on land, something more beneath the surface. Your X account looks the same as everyone's — but it carries a wallet only you can see into.

Built for **HackCanton Season 2** (July 2026) · Track: Financial Applications · Challenges: cBTC + cETH Ecosystem.

## Why

Crypto loses billions of social users at the same wall: install a wallet, back up 12 words, buy gas, paste a 0x address. Social-native wallets fix the friction — but on transparent chains they leak everything: every tip, every balance, every payment becomes public feed data.

**Selkie is built on Canton because privacy is native there.** Amounts are visible only to sender and recipient — enforced by the ledger, not a promise. Money, beneath the surface.

## What you can do from a mention

| Command | What happens |
|---|---|
| `send 0.01 CBTC to @ada` | Atomic transfer; recipient's wallet auto-created on first receive |
| `request 10 USDCX from @chidi` | They approve with one reply |
| `escrow 0.1 CBTC with @seller for "logo design"` | Two-party conditional payment, enforced by DAML |
| `split 30 USDCX among @a @b @c` | Bill split in one transaction |
| `reward top 3 replies with 1 CETH` | Community reward campaigns |
| `balance` | Private DM with your balances |

Plus a web dashboard (log in with X): balances, history, deposit/withdraw to any Canton wallet — and prediction markets with an AI market-maker quoting both sides, so no market is ever a dead pool.

## How cBTC & cETH are integrated

cBTC and cETH are **first-class settlement assets** in Selkie: every send, escrow, split, reward payout and market settlement is a state change on the asset — debit + credit composed atomically in a single Canton transaction. The MVP models holdings internally (`daml/daml/Selkie/Holding.daml`); the mainnet step swaps these for the CIP-56 token interfaces (same shape: amount + owner + atomic transfer), which is what makes cBTC, cETH and USDCx interchangeable inside one command grammar.

## Architecture

```
X mentions ─┐                        ┌─> Canton ledger (DAML)
            ├─> parser ─> bot core ──┤     Account · Holding · Transfer
Telegram  ──┘   (shared grammar)     │     Escrow · Request · Rewards
                                     └─> dashboard (React) + analytics
```

- `daml/` — the ledger model. Operator authorization is constrained to explicit contract choices: there is no choice that moves funds without the owner's instruction, so custody abuse is structurally impossible on-ledger.
- `bot/` — shared command parser + X/Telegram workers.
- `dashboard/` — web app (login with X).

## Trust model

Hosted-party model (like every consumer wallet on Canton today): the operator hosts user parties, but what the operator *may do* is exactly the DAML choices in `Account.daml` — credit, and debit-per-instruction. Every action is auditable on-ledger, and users can withdraw to self-custody Canton wallets at any time.

## Status

Building in public, July 16–26 2026 — follow [@SelkiePay](https://x.com/SelkiePay). Commits land as features do.

## Disclosure

Original work, started during HackCanton S2. The "social handle = wallet" UX pattern was popularized by projects like Dugong (Sui); Selkie's design, code and Canton-native architecture (private-by-default amounts, DAML-constrained custody, CIP-56 settlement) are built from scratch for Canton.

## License

MIT © 2026 Martin
