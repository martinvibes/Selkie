import { useCallback, useEffect, useState, type SubmitEvent } from "react";
import { Link, Navigate, NavLink, useParams, useSearchParams } from "react-router-dom";
import {
  Activity as ActivityIcon,
  AlertTriangle,
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  HandCoins,
  Inbox,
  Link2,
  Lock,
  Send,
  Sparkles,
} from "lucide-react";
import { Avatar, Header, Shell, Spinner } from "../components/Layout";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";
import { useToast } from "../contexts/ToastContext";
import {
  api,
  type Activity,
  type CampaignResult,
  type Deposit,
  type DepositClaim,
  type Me,
  type PaymentRequest,
  type Requests,
  type Reserve,
  type SendResult,
} from "../lib/api";
import { ASSET_LABEL, counterparty, money, parseHandles, timeAgo } from "../lib/format";

const TABS = [
  { id: "activity", label: "Activity", icon: <ActivityIcon size={19} /> },
  { id: "send", label: "Send", icon: <Send size={18} /> },
  { id: "deposit", label: "Receive", icon: <ArrowDownToLine size={19} /> },
  { id: "requests", label: "Requests", icon: <HandCoins size={19} /> },
  { id: "campaign", label: "Pay many", icon: <Sparkles size={18} /> },
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
    <button onClick={copy} className="btn btn-dim btn-sm shrink-0">
      {copied ? <Check size={14} /> : <Link2 size={14} />}
      {copied ? "Copied" : "Pay link"}
    </button>
  );
}

/** The gold card: who you are and what your handle holds, front and center. */
function HeroCard({ me, balances }: { me: Me; balances: Record<string, number> }) {
  const cc = balances.CC ?? 0;
  return (
    <section className="chunk-gold p-6 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <Avatar me={me} size={46} />
          <div className="leading-tight">
            <p className="eyebrow">Private wallet · Canton</p>
            <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight">{me.handle}</h1>
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-pen/25 bg-white/30 px-3 py-1 text-xs font-bold">
          <Lock size={11} /> Only you
        </span>
      </div>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-center gap-4">
          <TokenIcon asset="CC" size={46} />
          <div className="leading-none">
            <p className="num text-[clamp(2.5rem,7vw,3.4rem)] font-bold tracking-tight">{money(cc)}</p>
            <p className="mt-2 text-sm font-semibold text-pen/60">Canton Coin</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          <Link to="/dashboard/send" className="btn btn-dim btn-sm">
            <ArrowUpRight size={15} /> Send
          </Link>
          <PayLink handle={me.handle} />
        </div>
      </div>
    </section>
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

function TokenGrid({
  assets,
  balances,
  reserve,
}: {
  assets: string[];
  balances: Record<string, number>;
  reserve: Reserve | null;
}) {
  const empty = assets.every((a) => !balances[a]);
  return (
    <section className="chunk p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold">Balances</p>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-pen/50">
          <Lock size={12} /> Private on Canton
        </span>
      </div>

      {/* Two-up when the card is full-width, a single list in the side
          column: the amounts stay big either way. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        {assets.map((asset, i) => {
          const amount = balances[asset] ?? 0;
          return (
            <div
              key={asset}
              className="animate-rise flex items-center gap-3 rounded-xl border-2 border-pen bg-card-bright p-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <TokenIcon asset={asset} size={36} />
              <div className="min-w-0 leading-tight">
                <p className="text-sm font-bold">{ASSET_LABEL[asset] ?? asset}</p>
              </div>
              <span
                className={`num ml-auto text-2xl font-bold ${amount === 0 ? "text-pen/30" : ""}`}
              >
                {money(amount)}
              </span>
            </div>
          );
        })}
      </div>

      {empty && (
        <p className="mt-4 text-[13px] font-medium text-pen/50">
          Your wallet fills the moment someone sends you something.
        </p>
      )}

      {reserve?.active && (
        <p className="mt-4 flex items-center gap-2.5 border-t-2 border-pen/10 pt-4 text-[13px] font-medium text-pen/60">
          <span className="pulse-dot h-1.5 w-1.5 shrink-0 rounded-full bg-gold-deep" />
          <span>
            cBTC backed by a live reserve on {reserve.network}:{" "}
            <span className="num font-bold text-pen/85">
              {money(reserve.total)} {reserve.instrument}
            </span>{" "}
            on ledger · verified {timeAgo(reserve.asOf)}
          </span>
        </p>
      )}
    </section>
  );
}

function ActivityFeed({ entries }: { entries: Activity[] }) {
  if (!entries.length) {
    return (
      <div className="chunk p-10 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl border-2 border-pen bg-card-bright text-pen/45">
          <Inbox size={20} />
        </span>
        <p className="mt-4 font-bold">No payments yet.</p>
        <p className="mt-1 text-sm font-medium text-pen/55">Send one and it shows up here.</p>
      </div>
    );
  }

  return (
    <ul className="chunk overflow-hidden">
      {entries.map((e) => {
        const inbound = e.direction === "in";
        const row = (
          <>
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border-2 border-pen ${
                inbound ? "bg-[#e5f2d3] text-[#2f6d33]" : "bg-card-bright text-pen/60"
              }`}
            >
              {inbound ? <ArrowDownLeft size={15} /> : <ArrowUpRight size={15} />}
            </span>

            <TokenIcon asset={e.asset} size={28} />

            <div className="min-w-0 flex-1 leading-snug">
              <p className="flex items-baseline gap-2">
                <span className="num text-[15px] font-bold">
                  {inbound ? "+" : "−"}
                  {money(e.amount)}
                </span>
                <span className="text-[13px] font-semibold text-pen/50">
                  {ASSET_LABEL[e.asset] ?? e.asset}
                </span>
                {!inbound && e.onboarded && (
                  <span className="text-xs font-bold text-gold-ink">new wallet</span>
                )}
              </p>
              <p className="truncate text-[13px] font-medium text-pen/50">
                {inbound ? `from ${counterparty(e.from)}` : `to ${counterparty(e.to)}`}
                {e.memo ? ` · ${e.memo}` : ""}
              </p>
            </div>

            <span className="shrink-0 text-xs font-semibold text-pen/40">{timeAgo(e.ts)}</span>
          </>
        );

        const tint = inbound ? "bg-[#f4ecd7]" : "";
        return (
          <li key={e.id ?? `${e.ts}-${e.to}`} className="border-b-2 border-pen/10 last:border-0">
            {e.id ? (
              <Link
                to={`/tx/${e.id}`}
                className={`flex items-center gap-3.5 px-5 py-4 transition hover:bg-pen/[0.06] ${tint}`}
              >
                {row}
              </Link>
            ) : (
              <div className={`flex items-center gap-3.5 px-5 py-4 ${tint}`}>{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="shake flex items-start gap-2.5 rounded-xl border-2 border-pen bg-[#fadfe3] px-4 py-3 text-sm font-semibold text-[#7c1d2c]">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function ResultNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-rise rounded-xl border-2 border-pen bg-[#f7ecd2] p-5">
      <p className="flex items-center gap-2 font-bold text-gold-ink">
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

  async function submit(event: SubmitEvent) {
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
    <form onSubmit={submit} className="chunk grid gap-5 p-6 sm:p-7">
      <div className="grid gap-2">
        <label className="label" htmlFor="to">
          To
        </label>
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-4 font-semibold text-pen/40">@</span>
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
        <p className="text-[13px] font-medium text-pen/50">
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
          Note <span className="font-medium text-pen/40">(optional)</span>
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
          <p className="font-medium">
            <span className="num font-bold text-gold-ink">
              {money(result.amount)} {ASSET_LABEL[result.asset] ?? result.asset}
            </span>{" "}
            is now with <strong>{result.to}</strong>.
          </p>
          <p className="mt-2 text-sm font-medium text-pen/65">
            {result.onboarded
              ? `${result.to} had no wallet. Selkie made one, and the money is already theirs.`
              : "The amount stays between you two."}
          </p>
        </ResultNote>
      )}
    </form>
  );
}

/** A long ledger string you are meant to copy, never to retype. */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("success", `${label} copied.`);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("error", "Couldn't reach the clipboard.");
    }
  }

  return (
    <div className="grid gap-2">
      <span className="label">{label}</span>
      {/* A party id is 70 characters. It wraps rather than truncates: a
          half-shown address is worse than a two-line one, and letting it
          break keeps it from widening the whole column. */}
      <div className="flex items-start gap-2.5">
        <code className="num min-w-0 flex-1 break-all rounded-xl border-2 border-pen bg-card-bright px-4 py-3 text-[13px] font-semibold leading-relaxed">
          {value}
        </code>
        <button type="button" onClick={copy} className="btn btn-dim btn-sm shrink-0">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Your two ways to get paid: your handle, and the address behind it. */
function ReceiveCard({ me }: { me: Me }) {
  return (
    <section className="chunk p-6 sm:p-7">
      <div className="flex items-center gap-3.5">
        <Avatar me={me} size={44} />
        <div className="leading-tight">
          <p className="eyebrow">Get paid</p>
          <h2 className="mt-0.5 font-display text-2xl font-bold tracking-tight">{me.handle}</h2>
        </div>
      </div>
      <p className="mt-4 text-sm font-medium text-pen/60">
        On Selkie, people pay you by your handle — nothing to paste, no app to install. Share your
        handle, or your Canton address for wallets elsewhere on the network.
      </p>
      <div className="mt-5 grid gap-4">
        <CopyField label="Your handle" value={me.handle} />
        {me.address && <CopyField label="Your Canton address" value={me.address} />}
      </div>
      <p className="mt-4 flex items-start gap-2.5 border-t-2 border-pen/10 pt-4 text-[13px] font-medium text-pen/55">
        <Lock size={13} className="mt-0.5 shrink-0" />
        <span>
          Your handle is the instant path inside Selkie. The address is the on-ledger identity behind
          it — the same wallet, shown the way the rest of Canton addresses it.
        </span>
      </p>
    </section>
  );
}

function DepositPanel({ me, onDone }: { me: Me; onDone: () => void }) {
  const [info, setInfo] = useState<Deposit | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DepositClaim | null>(null);
  const toast = useToast();

  useEffect(() => {
    void api
      .deposit()
      .then(setInfo)
      .catch(() => setInfo({ active: false }));
  }, []);

  async function check(includeUntagged = false) {
    setBusy(true);
    try {
      const res = await api.claimDeposits(includeUntagged);
      setResult(res);
      toast(
        res.claimed.length ? "success" : "error",
        res.claimed.length
          ? `${money(res.total)} cBTC landed in your wallet.`
          : "Nothing waiting for your handle yet.",
      );
      onDone();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Couldn't reach the ledger.");
    } finally {
      setBusy(false);
    }
  }

  if (!info)
    return (
      <div className="grid gap-6">
        <ReceiveCard me={me} />
        <div className="chunk p-10 text-center font-bold text-pen/50">Loading…</div>
      </div>
    );

  if (!info.active) {
    return (
      <div className="grid gap-6">
        <ReceiveCard me={me} />
        <section className="chunk p-6 sm:p-7">
          <p className="font-display text-lg font-bold">cBTC funding is off on this build</p>
          <p className="mt-2 text-sm font-medium text-pen/60">
            Selkie pulls in cBTC on Canton devnet. This instance is running without a devnet
            connection, so there is nowhere to receive it — but your handle and address above still
            work for payments inside Selkie.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <ReceiveCard me={me} />
      <section className="chunk p-6 sm:p-7">
        <p className="font-display text-lg font-bold">
          Fund your wallet with {ASSET_LABEL[info.instrument] ?? info.instrument}
        </p>
        <p className="mt-2 text-sm font-medium text-pen/60">
          Send {ASSET_LABEL[info.instrument] ?? info.instrument} from any Canton wallet to the
          address below. Selkie receives for every handle at this one address, so the tag is what
          tells it the money is yours. Put it in the transfer's metadata under{" "}
          <code className="num font-bold text-pen/80">{info.tagKey}</code>.
        </p>

        {/* Canton Coin is not a token-standard holding, it is Amulet, and it
            moves through a different template that this path does not read
            yet. Saying so here beats a deposit that silently never arrives. */}
        <p className="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-pen bg-[#f7ecd2] px-4 py-3 text-[13px] font-semibold text-gold-ink">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {ASSET_LABEL[info.instrument] ?? info.instrument} only. Canton Coin sent from the Canton
            Coin Wallet will not appear here: it is a different kind of contract, and Selkie cannot
            read it yet.
          </span>
        </p>

        {info.isOperator && (
          <p className="mt-3 flex items-start gap-2.5 rounded-xl border-2 border-pen bg-[#fadfe3] px-4 py-3 text-[13px] font-semibold text-[#7c1d2c]">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              This address is your own Canton party, because you run the deposit party. Sending to
              it from your own wallet moves money from you to you and changes nothing. Deposits have
              to come from somebody else's party.
            </span>
          </p>
        )}

        <div className="mt-5 grid gap-4">
          <CopyField label={`Address on ${info.network}`} value={info.address} />
          <CopyField label="Your tag" value={info.tag} />
        </div>

        <p className="mt-5 flex items-start gap-2.5 border-t-2 border-pen/10 pt-4 text-[13px] font-medium text-pen/55">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>
            A transfer waits on the ledger until it is accepted, so nothing lands until you tap
            below. An untagged transfer is left alone rather than handed to whoever asks next.
          </span>
        </p>
      </section>

      <section className="chunk p-6 sm:p-7">
        <p className="font-display text-lg font-bold">Already sent something?</p>
        <p className="mt-1 text-[13px] font-medium text-pen/55">
          This reads the ledger for transfers tagged with your handle and accepts them.
        </p>
        <button onClick={() => check()} disabled={busy} className="btn btn-gold mt-4 w-full">
          {busy ? "Checking the ledger…" : "Check for deposits"}
        </button>

        {/* Faucet transfers name nobody. Only the handle running the deposit
            party can take those, and only by saying so. */}
        {info.isOperator && (
          <button
            onClick={() => check(true)}
            disabled={busy}
            className="btn btn-dim btn-sm mt-3 w-full"
          >
            Also take untagged transfers (operator)
          </button>
        )}

        {result && (
          <div className="mt-5">
            {result.claimed.length ? (
              <ResultNote title="Deposit settled on Canton">
                <p className="font-medium">
                  <span className="num font-bold text-gold-ink">
                    {money(result.total)} {info.instrument}
                  </span>{" "}
                  is now in your wallet, and in Selkie's on-ledger reserve.
                </p>
              </ResultNote>
            ) : (
              <p className="text-sm font-medium text-pen/55">
                Nothing tagged for {info.tag} is waiting. A transfer can take a moment to reach the
                participant.
              </p>
            )}
            {result.unattributed > 0 && (
              <p className="mt-3 text-[13px] font-medium text-pen/55">
                {result.unattributed} untagged{" "}
                {result.unattributed === 1 ? "transfer is" : "transfers are"} also waiting. Those
                name no handle, so Selkie will not assign them automatically.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** One open ask, with the buttons that end it. */
function RequestRow({
  req,
  side,
  onAnswer,
}: {
  req: PaymentRequest;
  side: "incoming" | "outgoing";
  onAnswer: (cid: string, action: "approve" | "decline" | "cancel") => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function answer(action: "approve" | "decline" | "cancel") {
    setBusy(action);
    try {
      await onAnswer(req.cid, action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border-2 border-pen bg-card-bright p-4">
      <div className="flex items-center gap-3">
        <TokenIcon asset={req.asset} size={32} />
        <div className="min-w-0 flex-1 leading-snug">
          <p className="flex items-baseline gap-2">
            <span className="num text-[15px] font-bold">{money(req.amount)}</span>
            <span className="text-[13px] font-semibold text-pen/50">
              {ASSET_LABEL[req.asset] ?? req.asset}
            </span>
          </p>
          <p className="truncate text-[13px] font-medium text-pen/55">
            {side === "incoming" ? `${req.from} asked you` : `you asked ${req.to}`}
            {req.memo ? ` · ${req.memo}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2.5">
        {side === "incoming" ? (
          <>
            <button
              className="btn btn-gold btn-sm"
              disabled={busy !== null}
              onClick={() => answer("approve")}
            >
              {busy === "approve" ? "Paying…" : "Pay"}
            </button>
            <button
              className="btn btn-dim btn-sm"
              disabled={busy !== null}
              onClick={() => answer("decline")}
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
          </>
        ) : (
          <button
            className="btn btn-dim btn-sm"
            disabled={busy !== null}
            onClick={() => answer("cancel")}
          >
            {busy === "cancel" ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
      </div>
    </li>
  );
}

function RequestsPanel({
  assets,
  requests,
  onDone,
}: {
  assets: string[];
  requests: Requests;
  onDone: () => void;
}) {
  const [from, setFrom] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState(assets[0] ?? "CC");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!from.trim()) return setError("Who are you asking?");
    if (!(value > 0)) return setError("Enter an amount greater than zero.");

    setBusy(true);
    try {
      const res = await api.askFor({
        from: from.replace(/^@+/, "").trim(),
        asset,
        amount: value,
        memo,
      });
      toast("success", `Asked ${res.to} for ${money(res.amount)} ${ASSET_LABEL[res.asset] ?? res.asset}`);
      setFrom("");
      setAmount("");
      setMemo("");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Nothing was asked.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(cid: string, action: "approve" | "decline" | "cancel") {
    try {
      await api.answerRequest({ cid, action });
      toast(
        "success",
        action === "approve"
          ? "Paid. Settled on Canton."
          : action === "decline"
            ? "Declined. No money moved."
            : "Request withdrawn.",
      );
      onDone();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "That didn't go through.");
    }
  }

  const { incoming, outgoing } = requests;

  return (
    <div className="grid gap-6">
      {incoming.length > 0 && (
        <section className="chunk p-5 sm:p-6">
          <p className="font-display text-lg font-bold">Waiting on you</p>
          <p className="mt-1 text-[13px] font-medium text-pen/55">
            Nothing has moved. It only moves when you tap Pay.
          </p>
          <ul className="mt-4 grid gap-3">
            {incoming.map((r) => (
              <RequestRow key={r.cid} req={r} side="incoming" onAnswer={answer} />
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="chunk p-5 sm:p-6">
          <p className="font-display text-lg font-bold">You're waiting on</p>
          <ul className="mt-4 grid gap-3">
            {outgoing.map((r) => (
              <RequestRow key={r.cid} req={r} side="outgoing" onAnswer={answer} />
            ))}
          </ul>
        </section>
      )}

      <form onSubmit={submit} className="chunk grid gap-5 p-6 sm:p-7">
        <div>
          <p className="font-display text-lg font-bold">Ask for money</p>
          <p className="mt-1 text-[13px] font-medium text-pen/55">
            They get a request, not a charge. Only their approval moves anything.
          </p>
        </div>

        <div className="grid gap-2">
          <label className="label" htmlFor="ask-from">
            From
          </label>
          <div className="relative flex items-center">
            <span className="pointer-events-none absolute left-4 font-semibold text-pen/40">@</span>
            <input
              id="ask-from"
              className="field pl-9"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="handle"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <label className="label" htmlFor="ask-amount">
            Amount
          </label>
          <input
            id="ask-amount"
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
          <label className="label" htmlFor="ask-memo">
            Note <span className="font-medium text-pen/40">(optional)</span>
          </label>
          <input
            id="ask-memo"
            className="field"
            value={memo}
            maxLength={140}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="what's it for"
            autoComplete="off"
          />
        </div>

        <button className="btn btn-gold w-full" disabled={busy} type="submit">
          {busy ? "Asking…" : "Send request"}
        </button>

        {error && <ErrorNote key={error}>{error}</ErrorNote>}
      </form>
    </div>
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

  async function submit(event: SubmitEvent) {
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
    <form onSubmit={submit} className="chunk grid gap-5 p-6 sm:p-7">
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
        <p className="text-[13px] font-medium text-pen/50">
          <span className="num font-bold text-pen/80">{winners.length}</span> handles. Each one gets
          the amount below.
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
          Note <span className="font-medium text-pen/40">(optional)</span>
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
                <span className="num text-4xl font-bold leading-none text-gold-ink">{value}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider text-pen/50">
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm font-medium text-pen/65">
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
  const [reserve, setReserve] = useState<Reserve | null>(null);
  const [requests, setRequests] = useState<Requests>({ incoming: [], outgoing: [] });

  const refresh = useCallback(async () => {
    if (!me) return;
    // The reserve is nice-to-have context; a hiccup there must not take the
    // wallet down with it.
    const [b, h, q, r] = await Promise.all([
      api.balance(),
      api.history(),
      api.requests(),
      api.reserve().catch(() => null),
    ]);
    setBalances(b.balances);
    setEntries(h.entries);
    setRequests(q);
    setReserve(r);
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
      <main className="pb-24 pt-8">
        <Shell wide>
          <div className="flex flex-col gap-6 lg:flex-row lg:justify-center lg:gap-7 lg:pt-3">
            {/* The floating rail: one square per thing you can do. */}
            <nav
              aria-label="Wallet sections"
              className="flex gap-3 lg:sticky lg:top-24 lg:h-fit lg:flex-col"
            >
              {TABS.map((t) => (
                <NavLink
                  key={t.id}
                  to={`/dashboard/${t.id}`}
                  title={t.label}
                  aria-label={t.label}
                  className={({ isActive }) => `rail-sq ${isActive ? "rail-on" : ""}`}
                >
                  {t.icon}
                  {t.id === "requests" && requests.incoming.length > 0 && (
                    <span className="rail-badge">{requests.incoming.length}</span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="w-full min-w-0 lg:max-w-4xl">
              <HeroCard me={me} balances={balances} />

              {/* Below the hero the wallet splits: what you hold on the left,
                  what you're doing on the right. A rail click lands its panel
                  on screen immediately — no scrolling to find it. On phones
                  the panel comes first for the same reason. */}
              <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
                {/* Keyed by tab so each switch gets the same soft entrance. */}
                <div className="min-w-0 animate-rise" key={tab}>
                  {tab === "activity" && <ActivityFeed entries={entries} />}
                  {tab === "send" && (
                    <SendPanel assets={me.assets} presetTo={presetTo} onDone={refresh} />
                  )}
                  {tab === "deposit" && <DepositPanel me={me} onDone={refresh} />}
                  {tab === "requests" && (
                    <RequestsPanel assets={me.assets} requests={requests} onDone={refresh} />
                  )}
                  {tab === "campaign" && <CampaignPanel assets={me.assets} onDone={refresh} />}
                </div>
                <div className="min-w-0 lg:sticky lg:top-24 lg:order-first">
                  <TokenGrid assets={me.assets} balances={balances} reserve={reserve} />
                </div>
              </div>
            </div>
          </div>
        </Shell>
      </main>
    </>
  );
}
