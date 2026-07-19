// Prints the Canton party id that Selkie receives tokens at.
//
//   node bot/scripts/address.mjs
//
// This is the value the cBTC faucet calls "Recipient Party Address" and the
// cETH request form calls "Canton address". It refuses to print a sandbox party
// for exactly that reason: a local party id looks identical to a real one
// (party-hint::1220<64 hex>) but exists only on this laptop, so tokens sent to
// it are gone and the cETH request is a single human-reviewed shot.

import { ledgerFromEnv } from "../src/ledger.mjs";

const { ledger, live } = ledgerFromEnv();
const operator = process.env.SELKIE_OPERATOR;

if (!operator) {
  console.error("SELKIE_OPERATOR is not set: there is no address to print.");
  process.exit(1);
}

const [hint, fingerprint] = operator.split("::");
if (!/^1220[0-9a-f]{64}$/.test(fingerprint ?? "")) {
  console.error(`This does not look like a Canton party id: ${operator}`);
  process.exit(1);
}

// Confirm the party is real on whatever ledger we are pointed at, so we never
// print an address that was only ever a string in an env var.
const parties = await ledger.listParties();
const known = parties.some((p) => p.identifier === operator);
if (!known) {
  console.error(`${operator}\nis not hosted on ${ledger.baseUrl}. Refusing to print it.`);
  process.exit(1);
}

if (!live) {
  console.error(
    [
      "REFUSING: this is a local sandbox party.",
      "",
      `  ${operator}`,
      "",
      "It has the right shape but exists only on this machine. Pasting it into",
      "the cBTC faucet or the cETH form sends real tokens nowhere, and the cETH",
      "request cannot be made twice.",
      "",
      "Point SELKIE_AUTH_TOKEN_URL and SELKIE_JSON_API at the onboarded DevNet",
      "validator, then run this again.",
    ].join("\n"),
  );
  process.exit(2);
}

console.log(operator);
console.error(`\n(hint ${hint}, hosted on ${ledger.baseUrl} — paste the line above into the form)`);
