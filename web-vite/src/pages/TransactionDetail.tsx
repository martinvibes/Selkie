import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Header, Shell, Spinner, Waterline } from "../components/Layout";
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
      <main className="pb-20">
        <Shell>
          <Link
            to="/dashboard/activity"
            className="mt-4 inline-flex items-center gap-2 text-[0.8125rem] text-ivory/50 transition hover:text-ivory"
          >
            <ArrowLeft size={15} /> Back to activity
          </Link>
        </Shell>

        <div className="my-6">
          <Waterline />
        </div>

        <Shell>
          {denied || !tx ? (
            <div className="card text-center">
              <Lock className="mx-auto text-ivory/30" size={22} />
              <p className="mt-4 font-semibold">This payment isn't yours to see.</p>
              <p className="mx-auto mt-2 max-w-md text-[0.8125rem] text-ivory/50">
                On Canton a payment is visible only to the people in it. If you were part of this one,
                sign in with that handle.
              </p>
            </div>
          ) : (
            <div className="animate-rise">
              <p className="eyebrow">{tx.direction === "in" ? "You received" : "You sent"}</p>
              <p className="mt-3 flex items-baseline gap-3">
                <span className="value text-[clamp(2.25rem,9vw,3.5rem)] font-medium -tracking-[0.03em]">
                  {money(tx.amount)}
                </span>
                <span className="value text-base font-bold tracking-wider">
                  {ASSET_LABEL[tx.asset] ?? tx.asset}
                </span>
              </p>

              <dl className="mt-8 grid gap-0 text-sm">
                {[
                  ["From", tx.from],
                  ["To", tx.to],
                  ["Note", tx.memo || "—"],
                  ["When", new Date(tx.ts).toLocaleString()],
                  ["Settled on", "Canton"],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 border-b border-ivory/10 py-3 last:border-0"
                  >
                    <dt className="label">{label}</dt>
                    <dd className="text-right text-ivory/80">{value}</dd>
                  </div>
                ))}
              </dl>

              {tx.onboarded && tx.direction === "out" && (
                <p className="mt-6 rounded-2xl border border-gold-light/25 bg-gold-light/[0.06] p-5 text-[0.8125rem] text-ivory/70">
                  {tx.to} had no wallet before this. Selkie created one as the payment settled, so there
                  was nothing for them to claim.
                </p>
              )}

              <p className="mt-6 flex items-center gap-2 text-[0.8125rem] text-ivory/30">
                <Lock size={13} /> Only you and {tx.direction === "in" ? tx.from : tx.to} can open this
                page.
              </p>
            </div>
          )}
        </Shell>
      </main>
    </>
  );
}
