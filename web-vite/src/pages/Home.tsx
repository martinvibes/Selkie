import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, Lock, Send, Users, Zap } from "lucide-react";
import { Frame, Header, Shell, Waterline, Spinner } from "../components/Layout";
import { EchoHero } from "../components/Mark";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";
import { ASSET_LABEL, ASSETS } from "../lib/format";

const TOKENS: { asset: string; name: string; note: string }[] = [
  { asset: "CC", name: "Canton Coin", note: "The network's native coin." },
  { asset: "USDCX", name: "USDCx", note: "A dollar, on Canton." },
  { asset: "CBTC", name: "cBTC", note: "Bitcoin, wrapped for Canton." },
  { asset: "CETH", name: "cETH", note: "Ether, wrapped for Canton." },
];

const COMMANDS = [
  { pre: "send ", strong: "25 CC", post: " to @ada" },
  { pre: "pay ", strong: "50 winners", post: " 5 CC each" },
  { pre: "send ", strong: "0.01 cBTC", post: " to @mira" },
  { pre: "reward ", strong: "@ben @cleo @theo", post: " 10 USDCx" },
  { pre: "", strong: "balance", post: "" },
  { pre: "send ", strong: "0.2 cETH", post: " to @theo" },
];

/** A public handle → its shareable pay page. The landing's one input. */
function PayAHandle() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const handle = value.replace(/^@+/, "").trim();
    if (handle) navigate(`/account/${handle}`);
  }

  return (
    <form onSubmit={go} className="card-strong card-pad">
      <p className="label">Pay a handle</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex flex-1 items-center">
          <span className="pointer-events-none absolute left-4 text-lg font-bold text-muted">@</span>
          <input
            className="field pl-9"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="anyhandle"
            autoComplete="off"
            spellCheck={false}
            aria-label="X handle to pay"
          />
        </div>
        <button type="submit" className="btn-primary shrink-0">
          Open <ArrowRight size={16} />
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Any handle can be paid, even one that has never opened Selkie.
      </p>
    </form>
  );
}

export function Home() {
  const { me, loading } = useAuth();

  if (loading) return <Spinner />;
  if (me) return <Navigate to="/dashboard/activity" replace />;

  return (
    <Frame>
      <Header />

      <main>
        {/* --- hero --- */}
        <Shell>
          <div className="grid items-center gap-10 py-8 sm:py-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="animate-rise">
              <span className="badge badge-live">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-ink" />
                Live on Canton devnet
              </span>

              <h1 className="mt-5 font-display text-[clamp(2.75rem,9vw,5.25rem)] font-extrabold uppercase leading-[0.9] text-balance">
                Pay a handle.
                <br />
                <span className="text-gold-light">Not an address.</span>
              </h1>

              <p className="mt-5 max-w-md text-[0.95rem] leading-relaxed text-muted">
                Selkie turns any X handle into a private Canton wallet. Send CC, USDCx, cBTC or cETH to
                @anyone. If they've never used Selkie, the payment builds their wallet as it settles.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <a href="/auth/x/login" className="btn-primary">
                  Continue with X <ArrowRight size={16} />
                </a>
                <span className="text-xs text-muted">
                  No app. No seed phrase. No gas. No public balance.
                </span>
              </div>
            </div>

            {/* floating medallion + token satellites */}
            <div className="relative mx-auto w-full max-w-sm animate-rise [animation-delay:120ms]">
              <EchoHero />
              <div className="pointer-events-none absolute inset-0">
                <span className="absolute left-0 top-6 animate-float [animation-delay:0.2s]">
                  <TokenIcon asset="CC" size={46} />
                </span>
                <span className="absolute right-1 top-16 animate-float [animation-delay:1.1s]">
                  <TokenIcon asset="CBTC" size={52} />
                </span>
                <span className="absolute bottom-10 left-4 animate-float [animation-delay:1.7s]">
                  <TokenIcon asset="CETH" size={44} />
                </span>
                <span className="absolute bottom-2 right-8 animate-float [animation-delay:0.6s]">
                  <TokenIcon asset="USDCX" size={40} />
                </span>
              </div>
            </div>
          </div>
        </Shell>

        {/* --- command marquee --- */}
        <div className="py-6">
          <div className="marquee">
            <div className="marquee-track">
              {[...COMMANDS, ...COMMANDS].map((c, i) => (
                <span key={i} className="cmd-chip">
                  <Send size={13} className="mr-2 text-gold-deep" />
                  {c.pre}
                  <b>{c.strong}</b>
                  {c.post}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* --- the thesis: surface vs beneath --- */}
        <Shell>
          <PayAHandle />
        </Shell>

        {/* --- tokens --- */}
        <Shell>
          <div className="py-12">
            <p className="eyebrow">Four tokens, one handle</p>
            <h2 className="mt-2 font-display text-[clamp(1.75rem,5vw,2.5rem)] font-extrabold uppercase">
              Send what you want
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {TOKENS.map((t, i) => (
                <div
                  key={t.asset}
                  className="card card-pad flex animate-rise items-center gap-4"
                  style={{ animationDelay: `${80 + i * 70}ms` }}
                >
                  <TokenIcon asset={t.asset} size={52} />
                  <div>
                    <p className="font-display text-xl font-extrabold">{ASSET_LABEL[t.asset] ?? t.asset}</p>
                    <p className="text-xs text-muted">
                      <span className="text-ivory/80">{t.name}.</span> {t.note}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Shell>

        <Waterline />

        {/* --- how it works --- */}
        <Shell>
          <div className="py-12">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: <Zap size={20} />,
                  title: "Sign in with X",
                  body: "Your handle becomes your wallet. No download, no seed phrase to lose.",
                },
                {
                  icon: <Users size={20} />,
                  title: "Send to any @handle",
                  body: "They don't need an account. First payment builds their wallet as it settles.",
                },
                {
                  icon: <Lock size={20} />,
                  title: "Balances stay private",
                  body: "Only you and who you paid can see the amount. Nothing is a public feed.",
                },
              ].map((step, i) => (
                <div
                  key={step.title}
                  className="card card-pad animate-rise"
                  style={{ animationDelay: `${80 + i * 90}ms` }}
                >
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border-2 border-ink bg-gold-light text-ink shadow-neo-sm">
                    {step.icon}
                  </span>
                  <p className="mt-4 font-display text-lg font-extrabold">{step.title}</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{step.body}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-col items-center gap-4 text-center">
              <a href="/auth/x/login" className="btn-primary">
                Claim your handle <ArrowRight size={16} />
              </a>
              <p className="text-xs text-muted">
                Supports {ASSETS.map((a) => ASSET_LABEL[a] ?? a).join(" · ")}.
              </p>
            </div>
          </div>
        </Shell>

        <footer className="pb-10 pt-4 text-center text-xs text-muted">
          Built on Canton, where balances are private by default. HackCanton S2.
        </footer>
      </main>
    </Frame>
  );
}
