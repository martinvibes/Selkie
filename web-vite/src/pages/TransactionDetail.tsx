import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Frame, Header, Shell, Spinner, Waterline } from "../components/Layout";
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
    <Frame>
      <Header />
      <main className="pb-20">
        <Shell>
          <Link
            to="/dashboard/activity"
            className="mt-2 inline-flex items-center gap-2 text-sm text-muted transition hover:text-ivory"
          >
            <ArrowLeft size={15} /> Back to activity
          </Link>
        </Shell>

        <div className="my-5">
          <Waterline />
        </div>

        <Shell>
          {denied || !tx ? (
            <div className="card-strong card-pad mx-auto max-w-md text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-raised">
                <Lock className="text-muted" size={20} />
              </span>
              <p className="mt-4 font-display text-xl font-extrabold">This payment isn't yours to see.</p>
              <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                On Canton a payment is visible only to the people in it. If you were part of this one,
                sign in with that handle.
              </p>
            </div>
          ) : (
            <div className="card-strong card-pad animate-rise">
              <div className="flex items-center gap-4">
                <TokenIcon asset={tx.asset} size={52} />
                <div>
                  <p className="eyebrow">{tx.direction === "in" ? "You received" : "You sent"}</p>
                  <p className="mt-1 flex items-baseline gap-2">
                    <span className="value text-[clamp(2rem,8vw,3rem)] font-medium -tracking-[0.03em]">
                      {money(tx.amount)}
                    </span>
                    <span className="value text-base font-bold tracking-wider">
                      {ASSET_LABEL[tx.asset] ?? tx.asset}
                    </span>
                  </p>
                </div>
              </div>

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
                <p className="mt-6 rounded-2xl border-2 border-gold-light/40 bg-gold-light/[0.07] p-5 text-sm text-ivory/80 shadow-neo-sm">
                  {tx.to} had no wallet before this. Selkie created one as the payment settled, so there
                  was nothing for them to claim.
                </p>
              )}

              <p className="mt-6 flex items-center gap-2 text-xs text-muted">
                <Lock size={13} /> Only you and {tx.direction === "in" ? tx.from : tx.to} can open this
                page.
              </p>
            </div>
          )}
        </Shell>
      </main>
    </Frame>
  );
}
