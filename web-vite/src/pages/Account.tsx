import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Header, Shell, Spinner, Waterline } from "../components/Layout";
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
    <>
      <Header />
      <main className="flex min-h-[calc(100vh-5rem)] flex-col justify-center py-10">
        <Shell>
          <div className="animate-rise text-center">
            <p className="eyebrow">On the surface</p>
            <h1 className="mt-2 text-[clamp(1.75rem,7vw,2.75rem)] font-extrabold -tracking-[0.02em]">
              {shown}
            </h1>
          </div>
        </Shell>

        <div className="my-6">
          <Waterline full />
        </div>

        <Shell>
          <div className="text-center">
            <p className="eyebrow text-gold-light/40">Beneath it</p>
            <p className="mx-auto mt-4 max-w-sm text-lg text-ivory/70">
              Private. Only {shown} can see what's here.
            </p>
            <p className="mx-auto mt-4 max-w-md text-[0.8125rem] text-ivory/30">
              {account?.exists
                ? "This handle has a Selkie wallet and can be paid right now."
                : "This handle doesn't have a wallet yet. Send them something and Selkie creates one for them."}
            </p>

            <div className="mt-8">
              {me ? (
                <a
                  href={isMe ? "/dashboard/activity" : `/dashboard/send?to=${shown.replace("@", "")}`}
                  className="btn-primary"
                >
                  {isMe ? "Go to your wallet" : `Send to ${shown}`}
                </a>
              ) : (
                <a href="/auth/x/login" className="btn-primary">
                  Continue with X to send
                </a>
              )}
            </div>
          </div>
        </Shell>
      </main>
    </>
  );
}
