# Selkie

**Turn any X handle into a private wallet.** Send money instantly. No app, no seed phrase, no gas, no public balance.

> `@SelkiePay send 5 USDCX to @lan` — that's the whole onboarding.

If you have a handle, you have a wallet. Selkie carries real Bitcoin (cBTC), ETH (cETH) and dollars (USDCx) on Canton, where balances are private by default.

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

Two layers, both real:

**Real cBTC on Canton DevNet.** Selkie holds a live cBTC reserve on the shared HackCanton participant (`hackcanton-01`) and moves it through the CIP-56 token standard: choice contexts come from the DA Utility registry, transfers execute as `TransferFactory_Transfer` / `TransferInstruction_Accept` on the JSON Ledger API v2, and every settlement prints its on-ledger `updateId`. `bot/src/cbtc.mjs` is the whole client, dependency-free; `GET /api/reserve` proves the holdings to anyone, no login required. Details: [docs/devnet.md](docs/devnet.md).

**Instant handle-to-handle payments.** Inside the wallet, every send, split and reward payout is a debit + credit composed atomically in a single Canton transaction (`daml/daml/Selkie/Holding.daml`), the same shape as the token standard (amount + owner + atomic transfer), which is what lets cBTC, cETH and USDCx share one command grammar.

## Architecture

```
X mentions ─┐                        ┌─> Canton ledger (DAML)
            ├─> parser ─> bot core ──┤     Account · Holding · Transfer
Telegram  ──┘   (shared grammar)     │     Escrow · Request · Rewards
                                     └─> dashboard (React) + analytics
```

- `daml/` — the ledger model. Operator authorization is constrained to explicit contract choices: there is no choice that moves funds without the owner's instruction, so custody abuse is structurally impossible on-ledger.
- `bot/` — shared command parser, wallet service, and the Telegram + X workers.
- `dashboard/` — web app (login with X).

## Run it

```bash
# 1. ledger: Canton 3 LocalNet (the Splice docker compose stack), then upload
#    the DAR and pin its package id
cd daml && daml build
export SELKIE_PKG_ID=$(daml damlc inspect-dar --json .daml/dist/selkie-0.1.0.dar | jq -r .main_package_id)

# 2. tests (unit + live-ledger integration against LocalNet on :3975)
cd bot && npm test
cd ../server && npm test

# 3. web wallet + API (X login, dashboard, /api/reserve)
cd server && source .env && node src/index.mjs    # http://localhost:4000

# 4. the Telegram bot (t.me/selkiepay_bot)
cd bot && source .env && node src/index.mjs
```

`demo-chat.mjs` replays a real community payout end to end. Latest local run: **20 winners paid in 9.2s, 20 of 20 onboarded mid-payment, 0 unclaimed.**

## Trust model

Hosted-party model (like every consumer wallet on Canton today): the operator hosts user parties, but what the operator *may do* is exactly the DAML choices in `Account.daml` — credit, and debit-per-instruction. Every action is auditable on-ledger, and users can withdraw to self-custody Canton wallets at any time.

## Status

Building in public, July 16–26 2026 — follow [@SelkiePay](https://x.com/SelkiePay). Commits land as features do.

## Disclosure

Original work, started during HackCanton S2. The "social handle = wallet" UX pattern was popularized by projects like Dugong (Sui); Selkie's design, code and Canton-native architecture (private-by-default amounts, DAML-constrained custody, CIP-56 settlement) are built from scratch for Canton.

## License

MIT © 2026 Martin
