import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { seal, unseal, parseCookies } from "../src/session.mjs";

const SECRET = "test-secret";

describe("sessions", () => {
  test("round-trips a signed payload", () => {
    const token = seal({ handle: "@ada" }, SECRET);
    assert.equal(unseal(token, SECRET).handle, "@ada");
  });

  test("rejects a payload edited into someone else's wallet", () => {
    const token = seal({ handle: "@ada" }, SECRET);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ handle: "@victim", exp: Date.now() + 1e6 })).toString(
      "base64url",
    );
    assert.equal(unseal(`${forged}.${sig}`, SECRET), null);
  });

  test("rejects a token signed with a different secret", () => {
    assert.equal(unseal(seal({ handle: "@ada" }, "other-secret"), SECRET), null);
  });

  test("rejects an expired token", () => {
    assert.equal(unseal(seal({ handle: "@ada" }, SECRET, { ttlSeconds: -1 }), SECRET), null);
  });

  test("rejects junk without throwing", () => {
    for (const junk of ["", "nope", "a.b.c", null, undefined, "...."]) {
      assert.equal(unseal(junk, SECRET), null);
    }
  });

  test("parses cookie headers", () => {
    const c = parseCookies("a=1; selkie_session=x%20y; empty");
    assert.equal(c.a, "1");
    assert.equal(c.selkie_session, "x y");
    assert.equal(c.empty, "");
  });
});
