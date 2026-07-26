// X worker: the surface-specific behaviour, tested without any network or
// ledger. The parser, dispatch and wallet have their own suites; here we lock
// the things that are unique to the public timeline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { XWorker, htmlToText } from "../src/x.mjs";

const creds = {
  apiKey: "key",
  apiSecret: "keysecret",
  accessToken: "token",
  accessSecret: "tokensecret",
  wallet: {},
};

test("htmlToText strips Telegram markup and decodes entities", () => {
  assert.equal(htmlToText("<b>Sent</b> <code>5</code> CC to @ada"), "Sent 5 CC to @ada");
  assert.equal(htmlToText("a &amp; b &lt;3 &gt;:)"), "a & b <3 >:)");
});

test("htmlToText caps a reply at 280 characters", () => {
  const out = htmlToText("x".repeat(400));
  assert.ok(out.length <= 280);
  assert.ok(out.endsWith("…"));
});

test("a balance is never posted to the public timeline", async () => {
  const worker = new XWorker(creds);
  const posted = [];
  worker.reply = (text, id) => {
    posted.push({ text, id });
    return Promise.resolve();
  };
  await worker.act({ id: "100", text: "@SelkiePay balance" }, "ada");
  assert.equal(posted.length, 1);
  assert.match(posted[0].text, /private/i);
  assert.match(posted[0].text, /selkiepay\.vercel\.app/i);
  assert.equal(posted[0].id, "100");
});

test("history is treated the same way as balance", async () => {
  const worker = new XWorker(creds);
  let posted = null;
  worker.reply = (text) => {
    posted = text;
    return Promise.resolve();
  };
  await worker.act({ id: "101", text: "@SelkiePay history" }, "ada");
  assert.match(posted, /private/i);
});

test("a mention that carries no command draws no reply", async () => {
  const worker = new XWorker(creds);
  let calls = 0;
  worker.reply = () => {
    calls++;
    return Promise.resolve();
  };
  await worker.act({ id: "102", text: "@SelkiePay gm, love this" }, "ada");
  assert.equal(calls, 0);
});

test("authHeader emits a signed OAuth 1.0a header", () => {
  const worker = new XWorker(creds);
  const header = worker.authHeader("POST", "https://api.twitter.com/2/tweets");
  assert.match(header, /^OAuth /);
  assert.match(header, /oauth_consumer_key="key"/);
  assert.match(header, /oauth_signature_method="HMAC-SHA1"/);
  assert.match(header, /oauth_signature="/);
});

test("a fresh worker skips the first batch as a baseline, then acts", async () => {
  const worker = new XWorker(creds);
  const acted = [];
  worker.act = (t, a) => {
    acted.push({ id: t.id, a });
    return Promise.resolve();
  };
  worker.get = async () => ({
    data: [{ id: "9", text: "@SelkiePay send 1 CC to @b", author_id: "u1" }],
    includes: { users: [{ id: "u1", username: "ada" }] },
    meta: { newest_id: "9", result_count: 1 },
  });
  await worker.poll(); // baseline run: records since_id, acts on nothing
  assert.equal(acted.length, 0);
  assert.equal(worker.sinceId, "9");

  worker.get = async () => ({
    data: [{ id: "10", text: "@SelkiePay send 2 CC to @c", author_id: "u1" }],
    includes: { users: [{ id: "u1", username: "ada" }] },
    meta: { newest_id: "10", result_count: 1 },
  });
  await worker.poll(); // now past baseline: this one is acted on
  assert.deepEqual(acted, [{ id: "10", a: "ada" }]);
});
