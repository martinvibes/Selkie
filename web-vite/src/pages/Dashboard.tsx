import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, Sparkles } from "lucide-react";
import { Frame, Header, Shell, Spinner, Waterline } from "../components/Layout";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";
import { api, type Activity, type CampaignResult, type SendResult } from "../lib/api";
import { ASSET_LABEL, money, parseHandles, timeAgo } from "../lib/format";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "send", label: "Send" },
  { id: "campaign", label: "Pay many" },
] as const;

/** Segmented token picker: a bright chip per asset, ink-on-gold when chosen. */
function AssetPicker({
  assets,
  value,
  onChange,
}: {
  assets: string[];
  value: string;
  onChange: (a: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {assets.map((a) => {
        const active = a === value;
        return (
          <button
            type="button"
            key={a}
            onClick={() => onChange(a)}
            className={`flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold transition ${
              active
                ? "border-ink bg-gold-light text-ink shadow-neo-sm"
                : "border-line/30 text-muted hover:border-line hover:text-ivory"
            }`}
          >
            <TokenIcon asset={a} size={20} />
            {ASSET_LABEL[a] ?? a}
          </button>
        );
      })}
    </div>
  );
}

function Balances({ assets, balances }: { assets: string[]; balances: Record<string, number> }) {
  const empty = assets.every((a) => !balances[a]);
  return (
    <section className="card-strong card-pad">
      <p className="eyebrow">Beneath the surface · private balances</p>
      <ul className="mt-4 grid gap-3">
        {assets.map((asset, i) => {
          const amount = balances[asset] ?? 0;
          return (
            <li
              key={asset}
              className="flex animate-rise items-center gap-3 border-b border-ivory/10 pb-3 last:border-0 last:pb-0"
              style={{ animationDelay: `${60 + i * 60}ms` }}
            >
              <TokenIcon asset={asset} size={40} />
              <span className="font-display text-lg font-extrabold">{ASSET_LABEL[asset] ?? asset}</span>
              <span
                className={
                  amount === 0
                    ? "num ml-auto text-[clamp(1.35rem,5vw,1.9rem)] font-medium text-ivory/25"
                    : "value ml-auto text-[clamp(1.35rem,5vw,1.9rem)] font-medium"
                }
              >
                {money(amount)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Only you, the person you paid, and the operator can see these amounts. Nothing here is public.
        {empty && " Your wallet fills the moment someone sends you something."}
      </p>
    </section>
  );
}

function ActivityFeed({ entries }: { entries: Activity[] }) {
  if (!entries.length) {
    return (
      <div className="card-pad text-center">
        <p className="text-sm text-muted">No payments yet. Send one and it shows up here.</p>
      </div>
    );
  }
  return (
    <ul className="card">
      {entries.map((e) => {
        const inbound = e.direction === "in";
        const row = (
          <>
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 border-ink ${
                inbound ? "bg-usdcx" : "bg-raised text-ivory"
              }`}
            >
              {inbound ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
            </span>
            <span className="num font-semibold">{money(e.amount)}</span>
            <span className="text-xs font-bold tracking-wider text-muted">
              {ASSET_LABEL[e.asset] ?? e.asset}
            </span>
            <span className="text-sm text-muted">{inbound ? `from ${e.from}` : `to ${e.to}`}</span>
            {!inbound && e.onboarded && (
              <span className="rounded-full border-2 border-ink bg-gold-light px-2 py-0.5 text-[0.625rem] font-extrabold uppercase tracking-wide text-ink">
                new wallet
              </span>
            )}
            <span className="ml-auto hidden text-xs text-muted sm:inline">
              {e.memo || timeAgo(e.ts)}
            </span>
          </>
        );
        return (
          <li key={e.id ?? `${e.ts}-${e.to}`} className="border-b-2 border-ink/60 last:border-0">
            {e.id ? (
              <Link
                to={`/tx/${e.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-raised/60"
              >
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3 px-5 py-3.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Result({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl border-2 border-gold-light/40 bg-gold-light/[0.07] p-5 shadow-neo-sm">
      {children}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border-2 border-orange-400/40 bg-orange-400/10 px-4 py-3 text-sm text-orange-100">
      {children}
    </p>
  );
}

function SendPanel({
  assets,
  presetTo,
  onDone,
}: {
  assets: string[];
  presetTo?: string;
  onDone: () => void;
}) {
  const [to, setTo] = useState(presetTo ?? "");
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
    <form onSubmit={submit} className="card card-pad grid gap-5">
      <div className="grid gap-2">
        <label className="label" htmlFor="to">
          To
        </label>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 font-bold text-muted">@</span>
          <input
            id="to"
            className="field pl-8"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="handle"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="text-xs text-muted">
          They don't need an account. If they've never used Selkie, this creates their wallet.
        </p>
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="amount">
          Amount
        </label>
        <input
          id="amount"
          className="field num"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <span className="label">Asset</span>
        <AssetPicker assets={assets} value={asset} onChange={setAsset} />
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="memo">
          Note <span className="font-medium normal-case tracking-normal text-muted">optional</span>
        </label>
        <input
          id="memo"
          className="field"
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

      {error && <ErrorNote>{error}</ErrorNote>}

      {result && (
        <Result>
          <p>
            Sent{" "}
            <span className="num font-semibold text-gold-light">
              {money(result.amount)} {ASSET_LABEL[result.asset] ?? result.asset}
            </span>{" "}
            to <strong>{result.to}</strong>.
          </p>
          <p className="mt-2 text-sm text-muted">
            {result.onboarded
              ? `${result.to} had no wallet. Selkie made one, and the money is already theirs.`
              : "Settled on Canton. The amount stays between you two."}
          </p>
        </Result>
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
      const res = await api.campaign({ winners, asset, amountEach: value, memo: memo || "reward" });
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
    <form onSubmit={submit} className="card card-pad grid gap-5">
      <div className="grid gap-2">
        <label className="label" htmlFor="winners">
          Winners
        </label>
        <textarea
          id="winners"
          className="field min-h-[6rem] resize-y leading-relaxed"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={"@ada @bayo @chidi\none per line, or separated by spaces"}
        />
        <p className="text-xs text-muted">
          <span className="num text-ivory/80">{winners.length}</span> handles. Each one gets the amount
          below.
        </p>
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="each">
          Amount each
        </label>
        <input
          id="each"
          className="field num"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <span className="label">Asset</span>
        <AssetPicker assets={assets} value={asset} onChange={setAsset} />
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="campaign-memo">
          Note <span className="font-medium normal-case tracking-normal text-muted">optional</span>
        </label>
        <input
          id="campaign-memo"
          className="field"
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

      {error && <ErrorNote>{error}</ErrorNote>}

      {result && (
        <Result>
          <div className="flex flex-wrap gap-8">
            {[
              ["paid", result.paid],
              ["onboarded", result.onboarded],
              ["unclaimed", result.failed.length],
            ].map(([label, value]) => (
              <div key={label as string} className="grid gap-1">
                <span className="num text-4xl font-medium leading-none text-gold-light">{value}</span>
                <span className="label">{label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">
            {result.failed.length
              ? result.failed.map((f) => `${f.handle}: ${f.error}`).join(" · ")
              : "Every winner was paid. Nobody had to claim anything."}
          </p>
        </Result>
      )}
    </form>
  );
}

export function Dashboard() {
  const { me, loading } = useAuth();
  const { tab } = useParams<{ tab: string }>();
  const [search] = useSearchParams();
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

  const presetTo = search.get("to") ?? undefined;

  return (
    <Frame>
      <Header />
      <main className="pb-20">
        <Shell>
          <section className="pt-4">
            <p className="eyebrow">Your handle, on the surface</p>
            <h1 className="mt-1.5 font-display text-[clamp(1.75rem,7vw,2.75rem)] font-extrabold uppercase">
              {me.handle}
            </h1>
          </section>
        </Shell>

        <div className="my-5">
          <Waterline />
        </div>

        <Shell>
          <Balances assets={me.assets} balances={balances} />

          <nav
            className="mt-8 flex flex-wrap gap-1 rounded-full border-2 border-line/20 bg-black/25 p-1"
            role="tablist"
          >
            {TABS.map((t) => (
              <NavLink
                key={t.id}
                to={`/dashboard/${t.id}`}
                role="tab"
                className={({ isActive }) => `tab ${isActive ? "tab-active" : ""}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4">
            {tab === "activity" && <ActivityFeed entries={entries} />}
            {tab === "send" && <SendPanel assets={me.assets} presetTo={presetTo} onDone={refresh} />}
            {tab === "campaign" && <CampaignPanel assets={me.assets} onDone={refresh} />}
          </div>

          {tab === "activity" && entries.length > 0 && (
            <p className="mt-4 flex items-center gap-2 text-xs text-muted">
              <Sparkles size={14} /> Tap any payment to see its receipt.
            </p>
          )}
        </Shell>
      </main>
    </Frame>
  );
}
