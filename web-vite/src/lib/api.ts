// Typed client for the Selkie server. The browser never holds a ledger token:
// every Canton call happens server-side, keyed to the session cookie.

export type Me = {
  handle: string;
  name?: string;
  avatar?: string | null;
  walletReady: boolean;
  assets: string[];
};

export type Balances = { handle: string; balances: Record<string, number> };

export type Activity = {
  id?: string;
  ts: string;
  type: "send" | "reward";
  from: string;
  to: string;
  asset: string;
  amount: number;
  memo?: string;
  onboarded?: boolean;
  direction: "in" | "out";
};

export type SendResult = {
  from: string;
  to: string;
  asset: string;
  amount: number;
  memo: string;
  onboarded: boolean;
  id?: string;
};

export type CampaignResult = {
  paid: number;
  onboarded: number;
  failed: { handle: string; error: string }[];
  results: { handle: string; ok: boolean; onboarded?: boolean }[];
};

export type PublicAccount = {
  handle: string;
  exists: boolean;
  canReceive: true;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export const api = {
  me: () => request<Me>("/api/me"),
  balance: () => request<Balances>("/api/balance"),
  history: () => request<{ entries: Activity[] }>("/api/history"),

  send: (payload: { to: string; asset: string; amount: number; memo?: string }) =>
    request<SendResult>("/api/send", { method: "POST", body: JSON.stringify(payload) }),

  campaign: (payload: { winners: string[]; asset: string; amountEach: number; memo?: string }) =>
    request<CampaignResult>("/api/campaign", { method: "POST", body: JSON.stringify(payload) }),

  account: (handle: string) =>
    request<PublicAccount>(`/api/account/${encodeURIComponent(handle.replace(/^@/, ""))}`),

  transaction: (id: string) => request<Activity>(`/api/tx/${encodeURIComponent(id)}`),
};
