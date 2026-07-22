import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Header, Shell, Spinner } from "../components/Layout";
import { TokenIcon } from "../components/TokenIcon";
import { api, ApiError, type Activity } from "../lib/api";
import { ASSET_LABEL, money } from "../lib/format";

/**
 * A payment's receipt. Dugong's equivalent page is public because Sui puts
 * every transfer on a block explorer. Ours opens only for the two people in
 * the payment: everyone else gets the same answer as a stranger, "no such
 * payment", which is what sub-transaction privacy actually means.
 */
export function TransactionDetail() {
  const { id = "" } = useParams();
  const [tx, setTx] = useState<Activity | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .transaction(id)
      .then((t) => !cancelled && setTx(t))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 404 || err.status === 401)) setDenied(true);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <Spinner />;

  return (
    <>
      <Header />
      <main className="pb-24 pt-8">
        <Shell>
          <Link
            to="/dashboard/activity"
            className="inline-flex items-center gap-2 text-sm text-ivory/50 transition hover:text-ivory"
          >
            <ArrowLeft size={15} /> Back to activity
          </Link>

          {denied || !tx ? (
            <div className="glass-strong mx-auto mt-8 max-w-md p-8 text-center sm:p-10">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-ivory/40">
                <Lock size={19} />
              </span>
              <p className="mt-4 font-display text-xl font-semibold">
                This payment isn't yours to see.
              </p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ivory/50">
                On Canton a payment is visible only to the people in it. If you were part of this
                one, sign in with that handle.
              </p>
            </div>
          ) : (
            <div className="glass-strong mt-8 animate-rise overflow-hidden p-7 sm:p-9">
              <span className="orb -right-24 -top-24 h-64 w-64 bg-gold/15" />

              <div className="flex items-center gap-4">
                <TokenIcon asset={tx.asset} size={46} />
                <div className="leading-tight">
                  <p className="eyebrow">{tx.direction === "in" ? "You received" : "You sent"}</p>
                  <p className="mt-1.5 flex items-baseline gap-2.5">
                    <span className="num text-[clamp(2.2rem,8vw,3.1rem)] font-medium tracking-tight">
                      {tx.direction === "in" ? "+" : "−"}
                      {money(tx.amount)}
                    </span>
                    <span className="num text-base font-semibold text-ivory/60">
                      {ASSET_LABEL[tx.asset] ?? tx.asset}
                    </span>
                  </p>
                </div>
              </div>

              <div className="glow-line my-7" />

              <dl className="grid gap-0 text-sm">
                {[
                  ["From", tx.from],
                  ["To", tx.to],
                  ["Note", tx.memo || "none"],
                  ["When", new Date(tx.ts).toLocaleString()],
                  ["Settled on", "Canton"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-3.5 last:border-0"
                  >
                    <dt className="label">{label}</dt>
                    <dd className="text-right text-ivory/80">{value}</dd>
                  </div>
                ))}
              </dl>

              {tx.onboarded && tx.direction === "out" && (
                <p className="mt-6 rounded-2xl border border-gold/30 bg-gold/[0.07] p-5 text-sm leading-relaxed text-ivory/75">
                  {tx.to} had no wallet before this. Selkie created one as the payment settled, so
                  there was nothing for them to claim.
                </p>
              )}

              <p className="mt-6 flex items-center gap-2 text-[13px] text-ivory/40">
                <Lock size={13} /> Only you and {tx.direction === "in" ? tx.from : tx.to} can open
                this page.
              </p>
            </div>
          )}
        </Shell>
      </main>
    </>
  );
}
