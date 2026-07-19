# Running Selkie on Canton DevNet

Everything in Selkie runs against a local DAML sandbox today. The code is not
sandbox-specific: `ledgerFromEnv()` picks its auth mode from the environment, so
moving to a real validator is configuration, not a rewrite.

## What changes

| | Sandbox | DevNet validator |
|---|---|---|
| Token | we sign it ourselves (HS256, shared secret) | fetched from the operator's OIDC provider |
| Rights | claimed in the token we minted | granted to the app user on the participant |
| Operator party | allocated on boot if missing | created once at onboarding, never re-allocated |
| Ledger reachable at | `localhost:7575` | the validator's JSON API |

Set these and the live path turns on. Nothing else changes:

```sh
export SELKIE_JSON_API=https://<validator>/v1
export SELKIE_LEDGER_ID=<ledger id>
export SELKIE_OPERATOR='selkie-operator::1220<64 hex>'
export SELKIE_AUTH_TOKEN_URL=https://<idp>/oauth/token
export SELKIE_AUTH_CLIENT_ID=...
export SELKIE_AUTH_CLIENT_SECRET=...
export SELKIE_AUTH_AUDIENCE=https://canton.network.global   # if the IdP wants one
```

Leaving `SELKIE_AUTH_TOKEN_URL` unset keeps local development exactly as it is.
A half-configured live setup fails at boot rather than at the first payment.

## Getting the address the token forms ask for

```sh
node bot/scripts/address.mjs
```

It prints the party id and nothing else, so it can be piped or pasted straight
into the cBTC faucet ("Recipient Party Address") or the cETH request form
("Canton address").

It **refuses** to print a sandbox party. A local party id has the same shape as
a real one, `party-hint::1220<64 hex>`, so there is nothing to eyeball. Tokens
sent to a local party are unrecoverable, and the cETH request is reviewed by a
human once. Do not fill either form until this command exits 0.

## Current blocker

Self-service validator onboarding is not reachable from our network:

```
POST https://sv.sv-1.dev.global.canton.network.sync.global/api/sv/v0/devnet/onboard/validator/prepare
  -> 403

GET  https://scan.sv-1.dev.global.canton.network.sync.global/api/scan/v0/dso
  -> 403
```

The public scan endpoint returning 403 as well means this is an egress IP
allowlist covering the DevNet global domain, not a permissions problem on the
onboarding route. It cannot be worked around from our side, and there is no
point retrying it. An SV operator has to either allowlist our egress IP or issue
an onboarding secret.

Until then Selkie runs end to end on the sandbox, which is what the tests and
the demo exercise.
