// Stateless signed-cookie sessions. HMAC-SHA256, no store, no dependencies.
// Tamper with the payload and the signature stops matching, so a cookie can
// never be edited into someone else's wallet.

import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (s) => Buffer.from(s).toString("base64url");
const unb64url = (s) => Buffer.from(s, "base64url").toString();

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function seal(data, secret, { ttlSeconds = 60 * 60 * 24 * 30 } = {}) {
  const body = b64url(JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000 }));
  return `${body}.${sign(body, secret)}`;
}

export function unseal(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = sign(body, secret);
  // Constant-time compare; lengths must match first or timingSafeEqual throws.
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(unb64url(body));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => {
        const i = c.indexOf("=");
        return i === -1 ? [c, ""] : [c.slice(0, i), decodeURIComponent(c.slice(i + 1))];
      }),
  );
}

export function cookie(name, value, { maxAge = 60 * 60 * 24 * 30, secure = false } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export const clearCookie = (name) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
