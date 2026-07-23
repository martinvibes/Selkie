// Selkie web server: X login, wallet API, static hosting. No dependencies.
//
// The browser never sees a ledger token. Every ledger call happens here, in
// the operator's trust boundary, keyed to whichever handle the session proves
// you control.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { normalizeHandle, ASSETS } from "../../bot/src/wallet.mjs";
import { HANDLE_KEY } from "../../bot/src/cbtc.mjs";
import { seal, unseal, parseCookies, cookie, clearCookie } from "./session.mjs";
import { pkce, authorizeUrl, exchangeCode, fetchProfile } from "./xauth.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const SESSION = "selkie_session";
const OAUTH = "selkie_oauth";

export function createApp({ wallet, config, history, cbtc = null }) {
  // One reserve read serves everyone for 30s: the endpoint is public, and the
  // ledger should not be re-queried per pageview.
  let reserveCache = null;
  const operatorHandle = config.operatorHandle ? normalizeHandle(config.operatorHandle) : null;
  const send = (res, status, body, headers = {}) => {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    });
    res.end(payload);
  };

  const readBody = (req) =>
    new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 1e6) reject(new Error("body too large"));
      });
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          reject(new Error("invalid JSON body"));
        }
      });
      req.on("error", reject);
    });

  const sessionOf = (req) => {
    const cookies = parseCookies(req.headers.cookie ?? "");
    return unseal(cookies[SESSION], config.sessionSecret);
  };

  // Landing after login goes straight to the wallet; the landing page itself
  // stays reachable at "/" for signed-in users.
  const login = (res, profile, redirectTo = "/dashboard/activity") => {
    const token = seal(
      { handle: normalizeHandle(profile.handle), xid: profile.id, name: profile.name, avatar: profile.avatar },
      config.sessionSecret,
    );
    res.writeHead(302, {
      "set-cookie": cookie(SESSION, token, { secure: config.secureCookies }),
      location: redirectTo,
    });
    res.end();
  };

  async function serveStatic(res, pathname) {
    if (!config.webRoot) return send(res, 404, { error: "not found" });
    // Contain path traversal: resolve inside webRoot or fall back to index.
    const rel = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
    let file = join(config.webRoot, rel);
    if (!file.startsWith(config.webRoot)) file = join(config.webRoot, "index.html");
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(data);
    } catch {
      try {
        // SPA fallback so deep links work.
        const data = await readFile(join(config.webRoot, "index.html"));
        res.writeHead(200, { "content-type": MIME[".html"] });
        res.end(data);
      } catch {
        send(res, 404, { error: "not found" });
      }
    }
  }

  return createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    const { pathname } = url;

    try {
      // --- health -----------------------------------------------------
      if (pathname === "/healthz") return send(res, 200, { ok: true });

      // --- auth: start the X login dance ------------------------------
      if (pathname === "/auth/x/login") {
        if (!config.x.clientId) {
          // A browser navigation deserves the landing page notice, not raw JSON.
          if ((req.headers.accept ?? "").includes("text/html")) {
            res.writeHead(302, { location: "/?login=unavailable" });
            return res.end();
          }
          return send(res, 503, { error: "X login is not configured on this deployment" });
        }
        const { verifier, challenge, state } = pkce();
        const pending = seal({ verifier, state }, config.sessionSecret, { ttlSeconds: 600 });
        res.writeHead(302, {
          "set-cookie": cookie(OAUTH, pending, { maxAge: 600, secure: config.secureCookies }),
          location: authorizeUrl({
            clientId: config.x.clientId,
            redirectUri: config.x.redirectUri,
            challenge,
            state,
          }),
        });
        return res.end();
      }

      if (pathname === "/auth/x/callback") {
        const cookies = parseCookies(req.headers.cookie ?? "");
        const pending = unseal(cookies[OAUTH], config.sessionSecret);
        if (!pending) return send(res, 400, { error: "login expired, try again" });
        if (url.searchParams.get("state") !== pending.state) {
          return send(res, 400, { error: "state mismatch" });
        }
        const code = url.searchParams.get("code");
        if (!code) return send(res, 400, { error: url.searchParams.get("error") ?? "no code" });

        const tokens = await exchangeCode({
          clientId: config.x.clientId,
          clientSecret: config.x.clientSecret,
          redirectUri: config.x.redirectUri,
          code,
          verifier: pending.verifier,
        });
        const profile = await fetchProfile(tokens.access_token);
        // Claiming: the wallet may already exist because someone paid them
        // before they ever logged in. ensureAccount returns it either way.
        try {
          await wallet.ensureAccount(profile.handle, "x");
        } catch (err) {
          // No pool party left to assign. Sign-in cannot open a wallet, so send
          // them back to the landing page with a notice rather than a raw 500.
          if (err.code === "POOL_EXHAUSTED") {
            res.writeHead(302, { location: "/?login=full" });
            return res.end();
          }
          throw err;
        }
        return login(res, profile);
      }

      // Local development sign-in. Creates real wallets on the real ledger;
      // it only skips proving handle ownership, so it stays off by default
      // and must never be enabled on a public deployment.
      if (pathname === "/auth/dev" && config.devLogin) {
        const handle = url.searchParams.get("handle");
        if (!handle) return send(res, 400, { error: "handle required" });
        try {
          await wallet.ensureAccount(handle, "x");
        } catch (err) {
          if (err.code === "POOL_EXHAUSTED") return send(res, 503, { error: err.message, code: err.code });
          throw err;
        }
        return login(res, { handle, id: `dev:${normalizeHandle(handle)}`, name: handle, avatar: null });
      }

      if (pathname === "/auth/logout") {
        res.writeHead(302, { "set-cookie": clearCookie(SESSION), location: "/" });
        return res.end();
      }

      // --- public API -------------------------------------------------
      // A handle's page is shareable, like a payment link. It proves the
      // handle can be paid and deliberately reveals nothing else: on Canton
      // a balance is not public data, so this endpoint never returns one.
      if (pathname.startsWith("/api/account/") && req.method === "GET") {
        const handle = decodeURIComponent(pathname.slice("/api/account/".length));
        if (!handle) return send(res, 400, { error: "handle required" });
        const account = await wallet.findAccount(handle);
        return send(res, 200, {
          handle: normalizeHandle(handle),
          exists: Boolean(account),
          canReceive: true,
        });
      }

      // Deliberately public, like the account pages: anyone can verify that
      // Selkie's cBTC is matched by real holdings on Canton devnet without
      // signing in. It reveals the operator's reserve and nothing about users.
      if (pathname === "/api/reserve" && req.method === "GET") {
        if (!cbtc) return send(res, 200, { active: false });
        try {
          if (!reserveCache || Date.now() - reserveCache.at > 30_000) {
            reserveCache = { at: Date.now(), holdings: await cbtc.holdings() };
          }
          const { at, holdings } = reserveCache;
          return send(res, 200, {
            active: true,
            instrument: cbtc.instrument,
            network: "Canton devnet",
            party: cbtc.party,
            total: holdings.total,
            unlocked: holdings.unlocked,
            contracts: holdings.contracts,
            asOf: new Date(at).toISOString(),
          });
        } catch (err) {
          return send(res, 503, { error: `reserve unavailable: ${err.message}` });
        }
      }

      // --- API --------------------------------------------------------
      if (pathname.startsWith("/api/")) {
        const session = sessionOf(req);
        if (!session) return send(res, 401, { error: "not signed in" });

        // A payment is visible to the two people in it and nobody else.
        if (pathname.startsWith("/api/tx/") && req.method === "GET") {
          const id = decodeURIComponent(pathname.slice("/api/tx/".length));
          const entry = await history.find(id);
          if (!entry) return send(res, 404, { error: "no such payment" });
          const mine = [entry.from, entry.to].map((h) => String(h).toLowerCase());
          if (!mine.includes(session.handle.toLowerCase())) {
            return send(res, 404, { error: "no such payment" });
          }
          return send(res, 200, {
            ...entry,
            direction: String(entry.from).toLowerCase() === session.handle.toLowerCase() ? "out" : "in",
          });
        }

        if (pathname === "/api/me" && req.method === "GET") {
          const account = await wallet.findAccount(session.handle);
          return send(res, 200, {
            handle: session.handle,
            name: session.name,
            avatar: session.avatar,
            walletReady: Boolean(account),
            // Your own Canton party: the real address behind your handle, the
            // one people outside Selkie can send to. Null until the wallet is
            // opened (it is opened at sign-in).
            address: account?.owner ?? null,
            assets: ASSETS,
          });
        }

        if (pathname === "/api/balance" && req.method === "GET") {
          const balances = await wallet.balance(session.handle);
          return send(res, 200, {
            handle: session.handle,
            balances: Object.fromEntries(ASSETS.map((a) => [a, balances[a] ?? 0])),
          });
        }

        if (pathname === "/api/history" && req.method === "GET") {
          return send(res, 200, { entries: await history.forHandle(session.handle) });
        }

        if (pathname === "/api/send" && req.method === "POST") {
          const body = await readBody(req);
          const to = String(body.to ?? "").trim();
          const asset = String(body.asset ?? "").toUpperCase();
          const amount = Number(body.amount);
          if (!to) return send(res, 400, { error: "who are you sending to?" });
          if (!ASSETS.includes(asset)) return send(res, 400, { error: `unknown asset: ${asset}` });
          if (!(amount > 0)) return send(res, 400, { error: "amount must be positive" });

          try {
            const result = await wallet.send({
              from: session.handle,
              to,
              asset,
              amount,
              memo: String(body.memo ?? "").slice(0, 140),
              platform: "x",
            });
            const logged = await history.append({
              type: "send",
              from: result.from,
              to: result.to,
              asset: result.asset,
              amount: result.amount,
              memo: result.memo,
              onboarded: result.onboarded,
            });
            return send(res, 200, { ...result, id: logged.id });
          } catch (err) {
            const status = err.code === "INSUFFICIENT_FUNDS" ? 400 : 500;
            return send(res, status, { error: err.message, code: err.code ?? null });
          }
        }

        // Where money gets into Selkie from the outside world.
        //
        // Selkie receives at ONE Canton party and keeps per-handle ownership in
        // its own contracts, so the address below is the same for everybody and
        // the handle tag is what makes a deposit yours. We say so plainly here
        // rather than dressing a shared address up as a personal one.
        if (pathname === "/api/deposit" && req.method === "GET") {
          if (!cbtc) return send(res, 200, { active: false });
          return send(res, 200, {
            active: true,
            address: cbtc.party,
            network: "Canton devnet",
            instrument: cbtc.instrument,
            tagKey: HANDLE_KEY,
            tag: session.handle,
            isOperator: operatorHandle === session.handle,
          });
        }

        // Claiming is receiver-side by design: on the token standard an
        // incoming transfer waits as an instruction until we accept it, so
        // nothing lands in a wallet without Selkie exercising a choice.
        if (pathname === "/api/deposit/claim" && req.method === "POST") {
          if (!cbtc) return send(res, 400, { error: "deposits are not configured" });
          try {
            const body = await readBody(req);
            // Untagged transfers, e.g. straight from the cBTC faucet, name
            // nobody. Only the handle that runs the deposit party may take
            // them, and only by asking for them explicitly.
            const sweeping =
              Boolean(body.includeUntagged) && operatorHandle === session.handle;
            const waiting = await cbtc.pending();
            const mine = waiting.filter((t) =>
              t.handle ? normalizeHandle(t.handle) === session.handle : sweeping,
            );
            const unattributed = sweeping ? 0 : waiting.filter((t) => !t.handle).length;

            const claimed = [];
            for (const t of mine) {
              const { updateId } = await cbtc.accept(t.cid);
              await wallet.deposit(session.handle, cbtc.instrument, t.amount);
              const logged = await history.append({
                type: "deposit",
                from: t.sender,
                to: session.handle,
                asset: cbtc.instrument,
                amount: t.amount,
                memo: "deposit from Canton",
                onboarded: false,
              });
              claimed.push({ amount: t.amount, sender: t.sender, updateId, id: logged.id });
            }
            // The reserve moved, so the cached copy is now a lie.
            if (claimed.length) reserveCache = null;
            return send(res, 200, {
              claimed,
              total: claimed.reduce((n, c) => n + c.amount, 0),
              unattributed,
            });
          } catch (err) {
            return send(res, 502, { error: `deposit check failed: ${err.message}` });
          }
        }

        if (pathname === "/api/requests" && req.method === "GET") {
          return send(res, 200, await wallet.requests(session.handle));
        }

        if (pathname === "/api/request" && req.method === "POST") {
          const body = await readBody(req);
          const from = String(body.from ?? "").trim();
          const asset = String(body.asset ?? "").toUpperCase();
          const amount = Number(body.amount);
          if (!from) return send(res, 400, { error: "who are you asking?" });
          if (!ASSETS.includes(asset)) return send(res, 400, { error: `unknown asset: ${asset}` });
          if (!(amount > 0)) return send(res, 400, { error: "amount must be positive" });

          try {
            const result = await wallet.requestPayment({
              from: session.handle,
              to: from,
              asset,
              amount,
              memo: String(body.memo ?? "").slice(0, 140),
              platform: "x",
            });
            // A request is not a payment, so it does not go in the payment
            // history. It shows up as an open request until it is answered.
            return send(res, 200, result);
          } catch (err) {
            return send(res, 500, { error: err.message, code: err.code ?? null });
          }
        }

        // Answering a request: approve settles it, decline closes it, and
        // cancel takes back one you sent. The wallet checks that the caller is
        // the party the contract names, so a stolen contract id gets nowhere.
        if (pathname === "/api/requests/answer" && req.method === "POST") {
          const body = await readBody(req);
          const cid = String(body.cid ?? "").trim();
          const action = String(body.action ?? "").toLowerCase();
          if (!cid) return send(res, 400, { error: "which request?" });
          if (!["approve", "decline", "cancel"].includes(action)) {
            return send(res, 400, { error: `unknown action: ${action}` });
          }

          try {
            if (action === "approve") {
              const paid = await wallet.approveRequest({ cid, payerHandle: session.handle });
              const logged = await history.append({
                type: "send",
                from: paid.from,
                to: paid.to,
                asset: paid.asset,
                amount: paid.amount,
                memo: paid.memo,
                onboarded: false,
              });
              return send(res, 200, { ...paid, action, id: logged.id });
            }
            const result =
              action === "decline"
                ? await wallet.declineRequest({ cid, payerHandle: session.handle })
                : await wallet.cancelRequest({ cid, requesterHandle: session.handle });
            return send(res, 200, { ...result, action });
          } catch (err) {
            const status =
              err.code === "NOT_YOUR_REQUEST" || err.code === "NO_SUCH_REQUEST"
                ? 403
                : err.code === "INSUFFICIENT_FUNDS"
                  ? 400
                  : 500;
            return send(res, status, { error: err.message, code: err.code ?? null });
          }
        }

        if (pathname === "/api/campaign" && req.method === "POST") {
          const body = await readBody(req);
          const winners = Array.isArray(body.winners) ? body.winners.filter(Boolean) : [];
          const asset = String(body.asset ?? "").toUpperCase();
          const amountEach = Number(body.amountEach);
          if (!winners.length) return send(res, 400, { error: "no winners given" });
          if (!ASSETS.includes(asset)) return send(res, 400, { error: `unknown asset: ${asset}` });
          if (!(amountEach > 0)) return send(res, 400, { error: "amount must be positive" });

          const result = await wallet.reward({
            from: session.handle,
            winners,
            asset,
            amountEach,
            memo: String(body.memo ?? "reward").slice(0, 140),
            platform: "x",
          });
          for (const r of result.results.filter((x) => x.ok)) {
            await history.append({
              type: "reward",
              from: session.handle,
              to: r.handle,
              asset,
              amount: amountEach,
              memo: String(body.memo ?? "reward"),
              onboarded: r.onboarded,
            });
          }
          return send(res, 200, result);
        }

        return send(res, 404, { error: "no such endpoint" });
      }

      // --- static -----------------------------------------------------
      if (req.method !== "GET") return send(res, 405, { error: "method not allowed" });
      return serveStatic(res, pathname === "/" ? "/index.html" : pathname);
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });
}
