import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Lock } from "lucide-react";
import { Frame, Header, Shell, Spinner, Waterline } from "../components/Layout";
import { Mark } from "../components/Mark";
import { api, type PublicAccount } from "../lib/api";
import { useAuth } from "../contexts/useAuth";

/**
 * A handle's public page: shareable like a payment link.
 *
 * Dugong can show anyone's balances here because Sui is transparent. On Canton
 * a balance is not public data, so this page proves the handle can be paid and
 * deliberately shows nothing else. The absence is the feature.
 */
export function Account() {
  const { handle = "" } = useParams();
  const { me } = useAuth();
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .account(handle)
      .then((a) => !cancelled && setAccount(a))
      .catch(() => !cancelled && setAccount(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [handle]);

  if (loading) return <Spinner />;

  const shown = account?.handle ?? `@${handle.replace(/^@/, "")}`;
  const isMe = me?.handle === shown;

  return (
    <Frame>
      <Header />
      <main className="flex min-h-[calc(100vh-6rem)] flex-col justify-center py-10">
        <Shell>
          <div className="card-strong card-pad mx-auto max-w-md animate-rise text-center">
            <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink bg-gold-light shadow-neo-sm">
              <Mark size={34} />
            </span>

            <p className="eyebrow mt-5">On the surface</p>
            <h1 className="mt-2 font-display text-[clamp(2rem,8vw,3rem)] font-extrabold uppercase">
              {shown}
            </h1>

            <div className="my-5">
              <Waterline full />
            </div>

            <p className="eyebrow text-gold-light/50">Beneath it</p>
            <p className="mx-auto mt-3 max-w-xs text-ivory/80">
              Private. Only {shown} can see what's here.
            </p>
            <p className="mx-auto mt-3 max-w-sm text-xs leading-relaxed text-muted">
              {account?.exists
                ? "This handle has a Selkie wallet and can be paid right now."
                : "This handle has no wallet yet. Send something and Selkie creates one as it settles."}
            </p>

            <div className="mt-7">
              {me ? (
                <a
                  href={isMe ? "/dashboard/activity" : `/dashboard/send?to=${shown.replace("@", "")}`}
                  className="btn-primary"
                >
                  {isMe ? "Go to your wallet" : `Send to ${shown}`} <ArrowRight size={16} />
                </a>
              ) : (
                <a href="/auth/x/login" className="btn-primary">
                  Continue with X to send <ArrowRight size={16} />
                </a>
              )}
            </div>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-muted">
              <Lock size={12} /> No public balance, ever.
            </p>
          </div>
        </Shell>
      </main>
    </Frame>
  );
}
