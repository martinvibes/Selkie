// The client-credentials path is what runs against a real validator, where a
// self-signed token is refused. We cannot point these at a live participant
// yet, so they run against a stub token endpoint that behaves like one.

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { cacheWindowSeconds, clientCredentialsAuth, ledgerFromEnv, mintToken } from "../src/ledger.mjs";

/** A stand-in OIDC token endpoint that counts how often it is asked. */
async function stubProvider({ expiresIn = 3600, status = 200, body } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      calls.push(Object.fromEntries(new URLSearchParams(raw)));
      res.writeHead(status, { "content-type": "application/json" });
      res.end(
        body ??
          JSON.stringify({ access_token: `token-${calls.length}`, expires_in: expiresIn }),
      );
    });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://localhost:${server.address().port}/token`, calls, close: () => server.close() };
}

test("client credentials: sends the grant the spec requires", async () => {
  const provider = await stubProvider();
  try {
    const auth = clientCredentialsAuth({
      tokenUrl: provider.url,
      clientId: "selkie-app",
      clientSecret: "shh",
      audience: "https://canton.network.global",
      scope: "daml_ledger_api",
    });
    assert.equal(await auth({}), "token-1");
    assert.deepEqual(provider.calls[0], {
      grant_type: "client_credentials",
      client_id: "selkie-app",
      client_secret: "shh",
      audience: "https://canton.network.global",
      scope: "daml_ledger_api",
    });
  } finally {
    provider.close();
  }
});

test("a live token is cached, not re-fetched on every ledger call", async () => {
  const provider = await stubProvider();
  try {
    const auth = clientCredentialsAuth({ tokenUrl: provider.url, clientId: "a", clientSecret: "b" });
    for (let i = 0; i < 5; i++) await auth({});
    assert.equal(provider.calls.length, 1, "one payout should not mean five token requests");
  } finally {
    provider.close();
  }
});

test("we always let go of a token before it expires", () => {
  // Including the awkward case: providers that issue tokens shorter-lived than
  // our own skew allowance. Holding one for its full life means handing it to a
  // request that outlives it.
  for (const lifetime of [1, 5, 30, 59, 60, 61, 300, 3600, 86400]) {
    for (const skew of [0, 30, 60, 120]) {
      const window = cacheWindowSeconds(lifetime, skew);
      assert.ok(window > 0, `lifetime ${lifetime}/skew ${skew} gave a non-positive window`);
      assert.ok(
        window < lifetime || lifetime <= 1,
        `lifetime ${lifetime}/skew ${skew} held the token for ${window}s, its whole life`,
      );
    }
  }
});

test("a short-lived token refreshes rather than being reused to the last second", async () => {
  const provider = await stubProvider({ expiresIn: 2 });
  try {
    const auth = clientCredentialsAuth({ tokenUrl: provider.url, clientId: "a", clientSecret: "b" });
    assert.equal(await auth({}), "token-1");
    await new Promise((r) => setTimeout(r, 1100)); // past half of a 2s life
    assert.equal(await auth({}), "token-2", "should have refreshed before expiry");
  } finally {
    provider.close();
  }
});

test("a refused token endpoint fails loudly, not with a mystery 401 later", async () => {
  const provider = await stubProvider({ status: 401, body: '{"error":"invalid_client"}' });
  try {
    const auth = clientCredentialsAuth({ tokenUrl: provider.url, clientId: "a", clientSecret: "b" });
    await assert.rejects(auth({}), /token endpoint refused us.*invalid_client/s);
  } finally {
    provider.close();
  }
});

test("the live path never signs its own token", async () => {
  const provider = await stubProvider();
  try {
    const { ledger, live } = ledgerFromEnv({
      SELKIE_PKG_ID: "pkg",
      SELKIE_JSON_API: "http://localhost:7575",
      SELKIE_AUTH_TOKEN_URL: provider.url,
      SELKIE_AUTH_CLIENT_ID: "a",
      SELKIE_AUTH_CLIENT_SECRET: "b",
    });
    assert.equal(live, true);

    const token = await ledger.token({ actAs: ["someone::1220ab"], admin: true });
    assert.equal(token, "token-1");

    // The whole point: rights come from the participant, not from a claim we
    // wrote ourselves, so asking for admin must not produce an admin claim.
    const selfSigned = mintToken({
      secret: "secret",
      applicationId: "selkie",
      ledgerId: "sandbox",
      actAs: ["someone::1220ab"],
      admin: true,
    });
    assert.notEqual(token, selfSigned);
    assert.doesNotMatch(token, /daml\.com/, "no self-minted ledger-api claims on a live network");
  } finally {
    provider.close();
  }
});

test("sandbox stays the default, so local dev needs no config", async () => {
  const { ledger, live } = ledgerFromEnv({ SELKIE_PKG_ID: "pkg" });
  assert.equal(live, false);
  const token = await ledger.token({ actAs: ["p::1220ab"] });
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert.deepEqual(claims["https://daml.com/ledger-api"].actAs, ["p::1220ab"]);
});

test("half-configured live auth is rejected at boot, not at first payment", () => {
  assert.throws(
    () => ledgerFromEnv({ SELKIE_PKG_ID: "pkg", SELKIE_AUTH_TOKEN_URL: "http://x/token" }),
    /SELKIE_AUTH_CLIENT_ID, SELKIE_AUTH_CLIENT_SECRET/,
  );
});
