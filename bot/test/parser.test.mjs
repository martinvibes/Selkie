import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCommand } from "../src/parser.mjs";

test("send with memo", () => {
  assert.deepEqual(parseCommand("@SelkiePay send 5 USDCX to @lan for coffee"), {
    type: "send", amount: "5", asset: "USDCX", to: "lan", memo: "for coffee",
  });
});

test("send cBTC case-insensitive asset", () => {
  const cmd = parseCommand("send 0.01 cbtc to @ada");
  assert.equal(cmd.type, "send");
  assert.equal(cmd.asset, "CBTC");
});

test("request", () => {
  const cmd = parseCommand("@SelkiePay request 10 USDCX from @chidi lunch");
  assert.equal(cmd.type, "request");
  assert.equal(cmd.from, "chidi");
});

test("escrow with quoted terms", () => {
  const cmd = parseCommand('escrow 0.1 CBTC with @seller for "logo design"');
  assert.deepEqual(cmd, {
    type: "escrow", amount: "0.1", asset: "CBTC", with: "seller", terms: "logo design",
  });
});

test("split among handles", () => {
  const cmd = parseCommand("split 30 USDCX among @a @b, @c");
  assert.equal(cmd.type, "split");
  assert.deepEqual(cmd.among, ["a", "b", "c"]);
});

test("reward campaign", () => {
  const cmd = parseCommand("reward top 3 replies with 1 CETH");
  assert.deepEqual(cmd, { type: "reward", winners: 3, amount: "1", asset: "CETH" });
});

test("balance", () => {
  assert.deepEqual(parseCommand("@SelkiePay balance"), { type: "balance" });
});

test("unknown asset rejected", () => {
  assert.equal(parseCommand("send 5 DOGE to @lan").type, "error");
});

test("zero amount rejected", () => {
  assert.equal(parseCommand("send 0 CBTC to @lan").type, "error");
});

test("noise returns null", () => {
  assert.equal(parseCommand("gm everyone"), null);
});
