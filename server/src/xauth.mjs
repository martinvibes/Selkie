// "Log in with X" — OAuth 2.0 Authorization Code with PKCE.
//
// This is the free tier of the X API and it is the entire identity layer:
// proving you control @handle is what claims the wallet that handle already
// owns. No paid endpoint is involved in signing in or getting paid.

import { createHash, randomBytes } from "node:crypto";

const AUTHORIZE = "https://x.com/i/oauth2/authorize";
const TOKEN = "https://api.x.com/2/oauth2/token";
const ME = "https://api.x.com/2/users/me";
const SCOPES = ["users.read", "tweet.read", "offline.access"];

export function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, state: randomBytes(16).toString("base64url") };
}

export function authorizeUrl({ clientId, redirectUri, challenge, state }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTHORIZE}?${q}`;
}

/** Exchange the callback code for an access token. */
export async function exchangeCode({ clientId, clientSecret, redirectUri, code, verifier }) {
  const headers = { "content-type": "application/x-www-form-urlencoded" };
  // Confidential clients authenticate with Basic; public (PKCE-only) clients don't.
  if (clientSecret) {
    headers.authorization =
      "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  }
  const res = await fetch(TOKEN, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: clientId,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`x token exchange failed: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

/** The handle behind the token. This is the wallet's identity. */
export async function fetchProfile(accessToken) {
  const res = await fetch(`${ME}?user.fields=profile_image_url,name`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`x profile fetch failed: ${json.title ?? res.status}`);
  return {
    id: json.data.id,
    handle: json.data.username,
    name: json.data.name,
    avatar: json.data.profile_image_url ?? null,
  };
}
