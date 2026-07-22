import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, NavLink, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Inbox,
  Link2,
  Lock,
  Sparkles,
} from "lucide-react";
import { Avatar, Header, Shell, Spinner } from "../components/Layout";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/ToastContext";
import { api, type Activity, type CampaignResult, type SendResult } from "../lib/api";
import { ASSET_LABEL, money, parseHandles, timeAgo } from "../lib/format";

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "send", label: "Send" },
  { id: "campaign", label: "Pay many" },
] as const;

/** Copyable pay page link: the shareable half of "your handle is your wallet". */
function PayLink({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/account/${handle.replace(/^@/, "")}`);
      setCopied(true);
      toast("success", "Pay link copied. Share it anywhere.");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("error", "Couldn't reach the clipboard.");
    }
  }

  return (
    <button onClick={copy} className="btn btn-dim btn-sm ml-auto shrink-0">
      {copied ? <Check size={14} /> : <Link2 size={14} />}
      {copied ? "Copied" : "Pay link"}
    </button>
  );
}

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
      {assets.map((a) => (
        <button
          type="button"
          key={a}
          onClick={() => onChange(a)}
          className={`chip ${a === value ? "chip-on" : ""}`}
          aria-pressed={a === value}
        >
          <TokenIcon asset={a} size={20} />
          {ASSET_LABEL[a] ?? a}
        </button>
      ))}
    </div>
  );
}

function Balances({ assets, balances }: { assets: string[]; balances: Record<string, number> }) {
  const empty = assets.every((a) => !balances[a]);
  return (
    <section className="glass-strong mt-8 p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-semibold">Balances</p>
        <span className="flex items-center gap-1.5 text-xs text-ivory/40">
          <Lock size={12} /> Only you can see these
        </span>
      </div>

      <ul className="mt-3">
        {assets.map((asset, i) => {
          const amount = balances[asset] ?? 0;
          return (
            <li
              key={asset}
              className="flex animate-rise items-center gap-3.5 border-b border-white/[0.05] py-3.5 last:border-0 last:pb-0"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <TokenIcon asset={asset} size={38} />
              <div className="leading-tight">
                <p className="text-[15px] font-semibold">{ASSET_LABEL[asset] ?? asset}</p>
              </div>
              <span
                className={`num ml-auto text-[1.45rem] font-medium ${amount === 0 ? "text-ivory/25" : ""}`}
              >
                {money(amount)}
              </span>
            </li>
          );
        })}
      </ul>

      {empty && (
        <p className="mt-4 text-[13px] text-ivory/40">
          Your wallet fills the moment someone sends you something.
        </p>
      )}
    </section>
  );
}

function ActivityFeed({ entries }: { entries: Activity[] }) {
  if (!entries.length) {
    return (
      <div className="glass p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ivory/35">
          <Inbox size={20} />
        </span>
        <p className="mt-4 font-medium">No payments yet.</p>
        <p className="mt-1 text-sm text-ivory/45">Send one and it shows up here.</p>
      </div>
    );
  }

  return (
    <ul className="glass overflow-hidden">
      {entries.map((e) => {
        const inbound = e.direction === "in";
        const row = (
          <>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
                inbound
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                  : "border-white/10 bg-white/[0.04] text-ivory/50"
              }`}
            >
              {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
            </span>

            <TokenIcon asset={e.asset} size={28} />

            <div className="min-w-0 flex-1 leading-snug">
              <p className="flex items-baseline gap-2">
                <span className="num text-[15px] font-semibold">
                  {inbound ? "+" : "−"}
                  {money(e.amount)}
                </span>
                <span className="text-[13px] text-ivory/45">{ASSET_LABEL[e.asset] ?? e.asset}</span>
                {!inbound && e.onboarded && (
                  <span className="text-xs font-medium text-gold-light/80">new wallet</span>
                )}
              </p>
              <p className="truncate text-[13px] text-ivory/45">
                {inbound ? `from ${e.from}` : `to ${e.to}`}
                {e.memo ? ` · ${e.memo}` : ""}
              </p>
            </div>

            <span className="shrink-0 text-xs text-ivory/35">{timeAgo(e.ts)}</span>
          </>
        );

        return (
          <li key={e.id ?? `${e.ts}-${e.to}`} className="border-b border-white/[0.05] last:border-0">
            {e.id ? (
              <Link
                to={`/tx/${e.id}`}
                className="flex items-center gap-3.5 px-5 py-4 transition hover:bg-white/[0.03]"
              >
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3.5 px-5 py-4">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="shake flex items-start gap-2.5 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function ResultNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-rise rounded-2xl border border-gold/30 bg-gold/[0.07] p-5">
      <p className="flex items-center gap-2 font-medium text-gold-light">
        <CheckCircle2 size={16} /> {title}
      </p>
      <div className="mt-2.5">{children}</div>
    </div>
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
  const toast = useToast();

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
      toast("success", `Sent ${money(res.amount)} ${ASSET_LABEL[res.asset] ?? res.asset} to ${res.to}`);
      setTo("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Nothing was sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass grid gap-5 p-6 sm:p-7">
      <div className="grid gap-2">
        <label className="label" htmlFor="to">
          To
        </label>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 text-ivory/35">@</span>
          <input
            id="to"
            className="field pl-9"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="handle"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <p className="text-[13px] text-ivory/40">
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

      <div className="grid gap-2.5">
        <span className="label">Asset</span>
        <AssetPicker assets={assets} value={asset} onChange={setAsset} />
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="memo">
          Note <span className="text-ivory/35">(optional)</span>
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

      <button className="btn btn-gold w-full" disabled={busy} type="submit">
        {busy ? "Sending…" : "Send payment"}
      </button>

      {error && <ErrorNote key={error}>{error}</ErrorNote>}

      {result && (
        <ResultNote title="Payment settled on Canton">
          <p>
            <span className="num font-semibold text-gold-light">
              {money(result.amount)} {ASSET_LABEL[result.asset] ?? result.asset}
            </span>{" "}
            is now with <strong>{result.to}</strong>.
          </p>
          <p className="mt-2 text-sm text-ivory/55">
            {result.onboarded
              ? `${result.to} had no wallet. Selkie made one, and the money is already theirs.`
              : "The amount stays between you two."}
          </p>
        </ResultNote>
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
  const toast = useToast();
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
      toast(
        res.failed.length ? "error" : "success",
        res.failed.length
          ? `Paid ${res.paid} of ${res.paid + res.failed.length} winners`
          : `Paid all ${res.paid} winners. Nothing left unclaimed.`,
      );
      setRaw("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Nobody was paid.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="glass grid gap-5 p-6 sm:p-7">
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
        <p className="text-[13px] text-ivory/40">
          <span className="num text-ivory/70">{winners.length}</span> handles. Each one gets the
          amount below.
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

      <div className="grid gap-2.5">
        <span className="label">Asset</span>
        <AssetPicker assets={assets} value={asset} onChange={setAsset} />
      </div>

      <div className="grid gap-2">
        <label className="label" htmlFor="campaign-memo">
          Note <span className="text-ivory/35">(optional)</span>
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

      <button className="btn btn-gold w-full" disabled={busy} type="submit">
        {busy
          ? `Paying ${winners.length}…`
          : winners.length
            ? `Pay ${winners.length} ${winners.length === 1 ? "winner" : "winners"}`
            : "Pay everyone"}
      </button>

      {error && <ErrorNote key={error}>{error}</ErrorNote>}

      {result && (
        <ResultNote title="Campaign settled on Canton">
          <div className="flex flex-wrap gap-10">
            {(
              [
                ["paid", result.paid],
                ["onboarded", result.onboarded],
                ["unclaimed", result.failed.length],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="grid gap-1">
                <span className="num text-4xl font-medium leading-none text-gold-light">{value}</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ivory/40">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-ivory/55">
            {result.failed.length
              ? result.failed.map((f) => `${f.handle}: ${f.error}`).join(" · ")
              : "Every winner was paid. Nobody had to claim anything."}
          </p>
        </ResultNote>
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
    <>
      <Header />
      <main className="pb-24 pt-10">
        <Shell>
          <div className="flex items-center gap-4">
            <Avatar me={me} size={52} />
            <div className="leading-tight">
              <p className="eyebrow">Private wallet</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {me.handle}
              </h1>
            </div>
            <PayLink handle={me.handle} />
          </div>

          <Balances assets={me.assets} balances={balances} />

          <nav className="seg mt-9" role="tablist">
            {TABS.map((t) => (
              <NavLink
                key={t.id}
                to={`/dashboard/${t.id}`}
                role="tab"
                className={({ isActive }) => `seg-item ${isActive ? "seg-on" : ""}`}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          {/* Keyed by tab so each switch gets the same soft entrance. */}
          <div className="mt-5 animate-rise" key={tab}>
            {tab === "activity" && <ActivityFeed entries={entries} />}
            {tab === "send" && <SendPanel assets={me.assets} presetTo={presetTo} onDone={refresh} />}
            {tab === "campaign" && <CampaignPanel assets={me.assets} onDone={refresh} />}
          </div>

          {tab === "activity" && entries.length > 0 && (
            <p className="mt-4 flex items-center gap-2 text-[13px] text-ivory/40">
              <Sparkles size={14} /> Tap any payment to see its receipt.
            </p>
          )}
        </Shell>
      </main>
    </>
  );
}
