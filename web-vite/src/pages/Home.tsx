import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Header, Shell, Spinner, Waterline } from "../components/Layout";
import { useAuth } from "../contexts/useAuth";

/** The thesis: a handle on the surface, value rising beneath it. */
function SurfacingBalance() {
  const [shown, setShown] = useState(0);
  const target = 0.75;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start - 500) / 1100, 1);
      if (t > 0) setShown(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex items-baseline justify-center gap-2">
      <span className="value text-[clamp(2.5rem,11vw,4.25rem)] font-medium -tracking-[0.03em]">
        {shown.toFixed(2)}
      </span>
      <span className="value text-base font-bold tracking-wider">cBTC</span>
    </div>
  );
}

export function Home() {
  const { me, loading } = useAuth();

  if (loading) return <Spinner />;
  if (me) return <Navigate to="/dashboard/activity" replace />;

  return (
    <>
      <Header />
      <main className="flex min-h-[calc(100vh-5rem)] flex-col justify-center py-10">
        <Shell>
          <div className="animate-rise text-center [animation-delay:60ms]">
            <p className="eyebrow">On the surface</p>
            <p className="mt-2 text-[clamp(1.75rem,7vw,2.75rem)] font-extrabold -tracking-[0.02em]">
              @yourhandle
            </p>
          </div>
        </Shell>

        <div className="my-6">
          <Waterline full />
        </div>

        <Shell>
          <div className="text-center">
            <p className="eyebrow animate-rise text-gold-light/40 [animation-delay:240ms]">Beneath it</p>
            <div className="mt-4 animate-rise [animation-delay:340ms]">
              <SurfacingBalance />
            </div>

            <p className="mx-auto mt-5 max-w-sm animate-rise text-ivory/50 [animation-delay:460ms]">
              Yours the moment someone sends it. No app, no seed phrase, no gas.
            </p>

            <div className="mt-8 animate-rise [animation-delay:560ms]">
              <a href="/auth/x/login" className="btn-primary">
                Continue with X
              </a>
              <p className="mt-4 text-[0.8125rem] text-ivory/30">
                Your handle is your wallet. Signing in claims it.
              </p>
            </div>
          </div>
        </Shell>
      </main>

      <footer className="pb-10 text-center text-[0.8125rem] text-ivory/30">
        Built on Canton, where balances are private by default.
      </footer>
    </>
  );
}
