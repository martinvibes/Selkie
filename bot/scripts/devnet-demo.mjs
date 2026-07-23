// Selkie's own wallet logic, running on the SHARED HackCanton devnet node.
//
//   (set -a; . server/.env; set +a; node bot/scripts/devnet-demo.mjs)
//
// This is the proof that Selkie is not a LocalNet-only project. The Selkie DAR
// is uploaded to the hackcanton-01 participant, and the organiser granted us
// actAs on a handful of real parties (selkie-x-ada, -cleo, -mira, -theo, ...).
// Here those parties become real Selkie wallets: one is credited, it pays
// another, and a third party on the very same ledger is shown to be blind to
// the amount. That last step is the whole pitch — private balances — verified
// on a network we do not control, not on a sandbox on this laptop.
//
// It reuses the devnet identity already configured for the cBTC reserve
// (SELKIE_CBTC_*), so no extra secrets are needed. It is read-mostly and the
// writes are Selkie's own Account/Holding contracts; it never touches the real
// cBTC or Canton Coin held by the operator party.

import { Ledger, passwordAuth } from "../src/ledger.mjs";
import { Wallet } from "../src/wallet.mjs";

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not set. Run with: (set -a; . server/.env; set +a; node bot/scripts/devnet-demo.mjs)`);
  return v;
};

const ledger = new Ledger({
  baseUrl: need("SELKIE_CBTC_LEDGER"),
  userId: need("SELKIE_CBTC_PARTY").split("::")[0],
  audience: process.env.SELKIE_AUTH_AUDIENCE ?? "https://canton.network.global",
  pkgId: need("SELKIE_PKG_ID"),
  auth: passwordAuth({
    tokenUrl: need("SELKIE_CBTC_TOKEN_URL"),
    clientId: need("SELKIE_CBTC_CLIENT_ID"),
    username: need("SELKIE_CBTC_USERNAME"),
    password: need("SELKIE_CBTC_PASSWORD"),
  }),
});

const shortOf = (p) => String(p).split("::")[0];

// The organiser hands us actAs on parties, but a granted party is only usable
// once it is actually hosted on a synchronizer this participant reaches. We
// check, and demo only with the ones that are live.
async function hosted(party) {
  const res = await fetch(`${ledger.baseUrl}/v2/parties/${encodeURIComponent(party)}`, {
    headers: { authorization: `Bearer ${await ledger.auth()}` },
  });
  const body = await res.json().catch(() => ({}));
  const details = body.partyDetails ?? body;
  return Array.isArray(details) ? Boolean(details[0]?.isLocal) : Boolean(details?.isLocal);
}

const line = (s = "") => console.log(s);

const parties = await ledger.myActAsParties();
const operator = parties.find((p) => p.startsWith("c699b723"));
if (!operator) throw new Error("no operator party in our actAs set");

// Named user parties follow the selkie-<platform>-<handle> convention, which is
// exactly what Wallet.ensureAccount derives, so a hint maps straight to a handle.
const users = [];
for (const p of parties) {
  const hint = shortOf(p);
  const m = /^selkie-x-(.+)$/.exec(hint);
  if (m && (await hosted(p))) users.push(m[1]);
}

line("Selkie on the shared HackCanton devnet node");
line("=".repeat(52));
line(`participant : ${ledger.baseUrl.replace(/^https?:\/\//, "").split(".")[0]}…`);
line(`package     : ${need("SELKIE_PKG_ID").slice(0, 16)}… (uploaded)`);
line(`operator    : ${shortOf(operator)}`);
line(`user wallets: ${users.map((u) => "@" + u).join(", ")}`);
line();

if (users.length < 3) throw new Error("need at least three hosted user parties for the privacy demo");
const [sender, receiver, bystander] = users;
const wallet = new Wallet({ ledger, operator });

line(`1. Open real wallets for @${sender} and @${receiver} on the shared node`);
await wallet.ensureAccount(sender, "x");
await wallet.ensureAccount(receiver, "x");
await wallet.ensureAccount(bystander, "x");
line(`   done. each @handle is a distinct Canton party.`);
line();

line(`2. Operator credits @${sender} 50 CC`);
await wallet.deposit(sender, "CC", 50);
line(`   @${sender}: ${JSON.stringify(await wallet.balance(sender))}`);
line();

line(`3. @${sender} pays @${receiver} 20 CC — settled on devnet`);
await wallet.send({ from: sender, to: receiver, asset: "CC", amount: 20, memo: "devnet demo", platform: "x" });
line(`   @${sender}: ${JSON.stringify(await wallet.balance(sender))}`);
line(`   @${receiver}: ${JSON.stringify(await wallet.balance(receiver))}`);
line();

line(`4. Privacy: can @${bystander}, a third party on the SAME ledger, see it?`);
const receiverParty = (await wallet.findAccount(receiver)).owner;
const bystanderParty = parties.find((p) => shortOf(p) === `selkie-x-${bystander}`);
const asOperator = await ledger.query([wallet.holdingTid], { owner: receiverParty }, [operator]);
const asBystander = (await ledger.query([wallet.holdingTid], {}, [bystanderParty])).filter(
  (h) => h.payload.owner === receiverParty,
);
line(`   operator (a co-signer) sees @${receiver}'s holdings : ${asOperator.length}`);
line(`   @${bystander} sees @${receiver}'s holdings            : ${asBystander.length}`);
line();
line(
  asBystander.length === 0
    ? `PRIVATE ✓  On a network Selkie does not control, a third party cannot`
    : `LEAK ✗  a third party could see the balance`,
);
if (asBystander.length === 0) line(`           see another user's balance. This is the differentiator.`);
