import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, useParams, Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { Header, Shell, Spinner, Waterline } from "../components/Layout";
import { useAuth } from "../contexts/useAuth";
import { api, type Activity, type CampaignResult, type SendResult } from "../lib/api";
import { ASSET_LABEL, money, parseHandles, timeAgo } from "../lib/format";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "send", label: "Send" },
  { id: "campaign", label: "Pay many" },
] as const;

function Balances({ assets, balances }: { assets: string[]; balances: Record<string, number> }) {
  const empty = assets.every((a) => !balances[a]);
  return (
    <section className="pt-6">
      <p className="eyebrow">Beneath the surface</p>
      <ul className="mt-4">
        {assets.map((asset, i) => {
          const amount = balances[asset] ?? 0;
          return (
            <li
              key={asset}
              className="flex animate-rise items-baseline justify-between gap-4 border-b border-ivory/10 py-3 last:border-0"
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <span className="text-xs font-bold tracking-wider text-ivory/50">
                {ASSET_LABEL[asset] ?? asset}
              </span>
              <span
                className={
                  amount === 0
                    ? "num text-[clamp(1.35rem,5vw,1.85rem)] font-medium text-ivory/30"
                    : "value text-[clamp(1.35rem,5vw,1.85rem)] font-medium"
                }
              >
                {money(amount)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 max-w-lg text-[0.8125rem] text-ivory/30">
        Only you, the person you paid, and the operator can see these amounts. Nothing here is public.
      </p>
      {empty && (
        <p className="mt-2 max-w-lg text-[0.8125rem] text-ivory/30">
          Your wallet fills up the moment someone sends you something.
        </p>
      )}
    </section>
  );
}

function ActivityFeed({ entries }: { entries: Activity[] }) {
  if (!entries.length) {
    return (
      <p className="py-6 text-[0.8125rem] text-ivory/30">
        No payments yet. Send one and it shows up here.
      </p>
    );
  }
  return (
    <ul>
      {entries.map((e) => {
        const inbound = e.direction === "in";
        const row = (
          <>
            <span className={inbound ? "text-gold" : "text-ivory/30"}>
              {inbound ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </span>
            <span className="num font-semibold">{money(e.amount)}</span>
            <span className="text-xs font-bold tracking-wider text-ivory/50">
              {ASSET_LABEL[e.asset] ?? e.asset}
            </span>
            <span className="text-ivory/50">{inbound ? `from ${e.from}` : `to ${e.to}`}</span>
            {!inbound && e.onboarded && (
              <span className="rounded-full border border-gold-deep/40 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wider text-gold-deep">
                new wallet
              </span>
            )}
            <span className="ml-auto hidden text-[0.8125rem] text-ivory/30 sm:inline">
              {e.memo || timeAgo(e.ts)}
            </span>
          </>
        );
        return (
          <li key={e.id ?? `${e.ts}-${e.to}`} className="border-b border-ivory/10 last:border-0">
            {e.id ? (
              <Link
                to={`/tx/${e.id}`}
                className="flex items-center gap-3 py-3 transition hover:opacity-80"
              >
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-3">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function SendPanel({ assets, onDone }: { assets: string[]; onDone: () => void }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(assets[0] ?? "CC");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!to.trim()) return setError("Who are you sending to?");
    if (!(value > 0)) return setError("Enter an amount greater than zero.");

    setBusy(true);
    try {
      const res = await api.send({ to: to.replace(/^@+/, "").trim(), asset, amount: value, memo });
      setResult(res);
      setTo("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 py-2">
      <div className="grid gap-2">
        <label className="label" htmlFor="to">
          To
        </label>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 text-ivory/30">@</span>
          <input
            id="to"
            className="input pl-8"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="handle"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-ivory/30">
          They don't need an account. If they've never used Selkie, this creates their wallet.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="grid flex-1 basis-32 gap-2">
          <label className="label" htmlFor="amount">
            Amount
          </label>
          <input
            id="amount"
            className="input num"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <label className="label" htmlFor="asset">
            Asset
          </label>
          <select
            id="asset"
            className="input num pr-8"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
          >
            {assets.map((a) => (
              <option key={a} value={a} className="bg-ink">
                {ASSET_LABEL[a] ?? a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="memo">
          Note <span className="font-medium normal-case tracking-normal text-ivory/30">optional</span>
        </label>
        <input
          id="memo"
          className="input"
          value={memo}
          maxLength={140}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="what's it for"
          autoComplete="off"
        />
      </div>

      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy ? "Sending…" : "Send"}
      </button>

      {error && (
        <p className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-[0.8125rem] text-orange-100">
          {error}
        </p>
      )}

      {result && (
        <div className="animate-rise rounded-2xl border border-gold-light/25 bg-gold-light/[0.06] p-5">
          <p>
            Sent{" "}
            <span className="num font-semibold text-gold-light">
              {money(result.amount)} {ASSET_LABEL[result.asset] ?? result.asset}
            </span>{" "}
            to <strong>{result.to}</strong>.
          </p>
          <p className="mt-2 text-[0.8125rem] text-ivory/50">
            {result.onboarded
              ? `${result.to} had no wallet. Selkie made one, and the money is already theirs.`
              : "Settled on Canton. The amount stays between you two."}
          </p>
        </div>
      )}
    </form>
  );
}

function CampaignPanel({ assets, onDone }: { assets: string[]; onDone: () => void }) {
  const [raw, setRaw] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(assets[0] ?? "CC");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const winners = parseHandles(raw);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!winners.length) return setError("Add at least one winner.");
    if (!(value > 0)) return setError("Enter an amount greater than zero.");

    setBusy(true);
    try {
      const res = await api.campaign({
        winners,
        asset,
        amountEach: value,
        memo: memo || "reward",
      });
      setResult(res);
      setRaw("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 py-2">
      <div className="grid gap-2">
        <label className="label" htmlFor="winners">
          Winners
        </label>
        <textarea
          id="winners"
          className="input min-h-[6rem] resize-y leading-relaxed"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"@ada @bayo @chidi\none per line, or separated by spaces"}
        />
        <p className="text-xs text-ivory/30">
          <span className="num text-ivory/60">{winners.length}</span> handles. Each one gets the amount
          below.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="grid flex-1 basis-32 gap-2">
          <label className="label" htmlFor="each">
            Amount each
          </label>
          <input
            id="each"
            className="input num"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <label className="label" htmlFor="campaign-asset">
            Asset
          </label>
          <select
            id="campaign-asset"
            className="input num pr-8"
            value={asset}
            onChange={(e) => setAsset(e.target.value)}
          >
            {assets.map((a) => (
              <option key={a} value={a} className="bg-ink">
                {ASSET_LABEL[a] ?? a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="campaign-memo">
          Note <span className="font-medium normal-case tracking-normal text-ivory/30">optional</span>
        </label>
        <input
          id="campaign-memo"
          className="input"
          value={memo}
          maxLength={140}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="meme contest winners"
          autoComplete="off"
        />
      </div>

      <button className="btn-primary w-full" disabled={busy} type="submit">
        {busy ? `Paying ${winners.length}…` : winners.length ? `Pay ${winners.length}` : "Pay everyone"}
      </button>

      {error && (
        <p className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-[0.8125rem] text-orange-100">
          {error}
        </p>
      )}

      {result && (
        <div className="animate-rise rounded-2xl border border-gold-light/25 bg-gold-light/[0.06] p-5">
          <div className="flex flex-wrap gap-8">
            {[
              ["paid", result.paid],
              ["onboarded", result.onboarded],
              ["unclaimed", result.failed.length],
            ].map(([label, value]) => (
              <div key={label as string} className="grid gap-1">
                <span className="num text-4xl font-medium leading-none text-gold-light">{value}</span>
                <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-ivory/30">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[0.8125rem] text-ivory/50">
            {result.failed.length
              ? result.failed.map((f) => `${f.handle}: ${f.error}`).join(" · ")
              : "Every winner was paid. Nobody had to claim anything."}
          </p>
        </div>
      )}
    </form>
  );
}

export function Dashboard() {
  const { me, loading } = useAuth();
  const { tab } = useParams<{ tab: string }>();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [entries, setEntries] = useState<Activity[]>([]);

  const refresh = useCallback(async () => {
    if (!me) return;
    const [b, h] = await Promise.all([api.balance(), api.history()]);
    setBalances(b.balances);
    setEntries(h.entries);
  }, [me]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/" replace />;
  if (!tab || !TABS.some((t) => t.id === tab)) return <Navigate to="/dashboard/activity" replace />;

  return (
    <>
      <Header />
      <main className="pb-20">
        <Shell>
          <section className="pt-6">
            <p className="eyebrow">Your handle, on the surface</p>
            <h1 className="mt-1.5 text-[clamp(1.5rem,6vw,2.25rem)] font-extrabold -tracking-[0.02em]">
              {me.handle}
            </h1>
          </section>
        </Shell>

        <div className="mt-5">
          <Waterline />
        </div>

        <Shell>
          <Balances assets={me.assets} balances={balances} />

          <nav className="mt-10 flex gap-1 rounded-full bg-black/25 p-1" role="tablist">
            {TABS.map((t) => (
              <NavLink
                key={t.id}
                to={`/dashboard/${t.id}`}
                role="tab"
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-xs font-bold tracking-wide transition ${
                    isActive ? "bg-ivory/10 text-ivory" : "text-ivory/50 hover:text-ivory"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="card mt-4">
            {tab === "activity" && <ActivityFeed entries={entries} />}
            {tab === "send" && <SendPanel assets={me.assets} onDone={refresh} />}
            {tab === "campaign" && <CampaignPanel assets={me.assets} onDone={refresh} />}
          </div>

          {tab === "activity" && entries.length > 0 && (
            <p className="mt-4 flex items-center gap-2 text-[0.8125rem] text-ivory/30">
              <Sparkles size={14} /> Tap any payment to see its receipt.
            </p>
          )}
        </Shell>
      </main>
    </>
  );
}
