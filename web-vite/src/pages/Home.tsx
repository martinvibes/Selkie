import { useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, AtSign, EyeOff, Lock, Send, Zap } from "lucide-react";
import { Footer, Header, Shell, Spinner } from "../components/Layout";
import { XLogo } from "../components/Mark";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";

/* Illustrative wallet for "@yourhandle": what the product feels like. */
const CARD_ROWS = [
  { asset: "CC", sym: "CC", name: "Canton Coin", amount: "1,284.09" },
  { asset: "USDCX", sym: "USDCx", name: "Digital dollar", amount: "250.00" },
  { asset: "CBTC", sym: "cBTC", name: "Bitcoin on Canton", amount: "0.0500" },
  { asset: "CETH", sym: "cETH", name: "Ether on Canton", amount: "1.2500" },
];

const MARQUEE = [
  { asset: "CC", text: <>@dara sent <b>25 CC</b> to @ben</> },
  { asset: "CBTC", text: <>@theo sent <b>0.01 cBTC</b> to @ada</> },
  { asset: "CC", text: <>@mira paid <b>20 winners</b> 5 CC each</> },
  { asset: "USDCX", text: <>@ada sent <b>100 USDCx</b> to @cleo</> },
  { asset: "CETH", text: <>@ben sent <b>0.2 cETH</b> to @mira</> },
  { asset: "CC", text: <>@noah sent <b>75 CC</b> to @tayo</> },
];

const STEPS = [
  {
    n: "01",
    icon: <Zap size={19} />,
    title: "Sign in with X",
    body: "One tap. Your handle becomes your wallet. Nothing to install, nothing to write down, nothing to lose.",
  },
  {
    n: "02",
    icon: <Send size={19} />,
    title: "Pay any @handle",
    body: "Type a handle and an amount. If they have never heard of Selkie, the payment itself creates their wallet.",
  },
  {
    n: "03",
    icon: <EyeOff size={19} />,
    title: "Stay private",
    body: "Amounts and balances are visible only to the people in the payment. On Canton, privacy is the default.",
  },
];

const ASSET_TILES = [
  { asset: "CC", name: "Canton Coin", sym: "CC", note: "The Canton Network's native asset." },
  { asset: "USDCX", name: "USDCx", sym: "USDCX", note: "A digital dollar on Canton." },
  { asset: "CBTC", name: "cBTC", sym: "CBTC", note: "Bitcoin, ported to Canton." },
  { asset: "CETH", name: "cETH", sym: "CETH", note: "Ether, ported to Canton." },
];

/**
 * The hero object: a glass wallet card that tilts toward the cursor. The
 * balances sit frosted until you hover, which is the product thesis rendered
 * literally: the value is there, and only leaning in reveals it.
 */
function WalletCard() {
  const card = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = card.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  }
  function onLeave() {
    const el = card.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
  }

  return (
    <div className="tilt-wrap relative mx-auto w-full max-w-sm" onMouseMove={onMove} onMouseLeave={onLeave}>
      <span className="orb -right-10 -top-12 h-64 w-64 bg-gold/25" style={{ animation: "drift 7s ease-in-out infinite" }} />
      <span className="orb -bottom-16 -left-12 h-56 w-56 bg-[#8a7aff]/15" style={{ animation: "drift 9s ease-in-out infinite reverse" }} />

      <div ref={card} className="tilt-card glass-strong p-6 sm:p-7">
        <span className="card-shine" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.02] text-gold-light">
              <AtSign size={17} />
            </span>
            <div>
              <p className="font-display text-[1.05rem] font-semibold leading-tight">@yourhandle</p>
              <p className="text-xs text-ivory/45">Private wallet · Canton</p>
            </div>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-gold/30 bg-gold/10 text-gold-light">
            <Lock size={13} />
          </span>
        </div>

        <div className="glow-line my-5" />

        <ul>
          {CARD_ROWS.map((row) => (
            <li key={row.asset} className="flex items-center gap-3 border-b border-white/[0.05] py-3 last:border-0">
              <TokenIcon asset={row.asset} size={34} />
              <div className="leading-tight">
                <p className="text-sm font-semibold">{row.sym}</p>
                <p className="text-xs text-ivory/40">{row.name}</p>
              </div>
              <span className="veil num ml-auto text-[1.05rem] font-medium">{row.amount}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 flex items-center gap-1.5 text-xs text-ivory/40">
          <Lock size={11} /> Only @yourhandle can see these. Hover to peek.
        </p>
      </div>
    </div>
  );
}

/** One input on the whole landing: open any handle's pay page. */
function PayAHandle() {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  function go(e: React.FormEvent) {
    e.preventDefault();
    const handle = value.replace(/^@+/, "").trim();
    if (handle) navigate(`/account/${handle}`);
  }

  return (
    <form onSubmit={go} className="mx-auto mt-9 flex w-full max-w-sm items-center gap-2.5">
      <div className="relative flex flex-1 items-center">
        <span className="pointer-events-none absolute left-4 text-ivory/35">@</span>
        <input
          className="field pl-9"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="open someone's pay page"
          autoComplete="off"
          spellCheck={false}
          aria-label="X handle to pay"
        />
      </div>
      <button type="submit" aria-label="Open pay page" className="btn btn-gold h-12 w-12 shrink-0 !p-0">
        <ArrowRight size={17} />
      </button>
    </form>
  );
}

export function Home() {
  const { me, loading } = useAuth();
  const [params] = useSearchParams();

  if (loading) return <Spinner />;
  if (me) return <Navigate to="/dashboard/activity" replace />;

  const loginUnavailable = params.get("login") === "unavailable";

  return (
    <>
      <Header />

      <main>
        {/* ---- hero ---- */}
        <Shell wide>
          <div className="grid items-center gap-14 pb-16 pt-14 sm:pt-20 lg:grid-cols-2 lg:gap-10">
            <div className="animate-rise">
              <span className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/[0.08] px-3.5 py-1.5 text-xs font-semibold text-gold-light">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-gold-light" />
                Live on Canton devnet
              </span>

              <h1 className="mt-6 font-display text-[clamp(2.9rem,6.5vw,4.6rem)] font-bold leading-[1.02] tracking-[-0.03em] text-balance">
                Pay a handle.
                <br />
                <span className="text-gold-grad">Not an address.</span>
              </h1>

              <p className="mt-6 max-w-md text-[1.05rem] leading-relaxed text-ivory/60">
                Selkie turns any X handle into a private wallet on Canton. Send CC, USDCx, cBTC or
                cETH to @anyone. If they have never used Selkie, your payment creates their wallet
                the moment it lands.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                <a href="/auth/x/login" className="btn btn-gold">
                  <XLogo size={15} /> Continue with X
                </a>
                <a href="#how" className="btn btn-dim">
                  How it works
                </a>
              </div>

              {loginUnavailable && (
                <p className="mt-5 max-w-md rounded-xl border border-amber-300/25 bg-amber-300/[0.07] px-4 py-3 text-[13px] leading-relaxed text-amber-100/90">
                  X sign-in is coded and ready but this deployment is missing its X API keys. Set
                  X_CLIENT_ID and X_CLIENT_SECRET on the server to switch it on.
                </p>
              )}

              <p className="mt-7 text-[13px] text-ivory/40">
                No app · No seed phrase · No gas · No public balances
              </p>
            </div>

            <div className="animate-rise [animation-delay:150ms]">
              <WalletCard />
            </div>
          </div>
        </Shell>

        {/* ---- live-feel marquee ---- */}
        <div className="marquee py-3">
          {[0, 1].map((copy) => (
            <div className="marquee-track" key={copy} aria-hidden={copy === 1}>
              {MARQUEE.map((item, i) => (
                <span key={i} className="cmd">
                  <TokenIcon asset={item.asset} size={16} />
                  {item.text}
                </span>
              ))}
            </div>
          ))}
        </div>

        {/* ---- how it works ---- */}
        <Shell wide>
          <section id="how" className="pt-24">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Three steps, zero crypto homework.
            </h2>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <div
                  key={step.n}
                  className="glass animate-rise overflow-hidden p-7"
                  style={{ animationDelay: `${i * 90}ms` }}
                >
                  <span className="pointer-events-none absolute right-5 top-1 select-none font-display text-[4.5rem] font-bold text-white/[0.045]">
                    {step.n}
                  </span>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-gold/25 bg-gold/[0.12] text-gold-light">
                    {step.icon}
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ivory/55">{step.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---- assets ---- */}
          <section className="pt-24">
            <p className="eyebrow">Assets</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Send what you want.
            </h2>
            <p className="mt-3 max-w-lg text-ivory/55">
              One handle holds them all, and every balance stays between you and whoever you pay.
            </p>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {ASSET_TILES.map((t) => (
                <div
                  key={t.asset}
                  className="glass p-5 transition duration-300 hover:-translate-y-1 hover:border-white/20"
                >
                  <TokenIcon asset={t.asset} size={44} />
                  <p className="mt-4 font-display text-lg font-semibold">{t.name}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ivory/45">{t.note}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ---- closing CTA ---- */}
          <section className="pt-24">
            <div className="glass-strong overflow-hidden p-10 text-center sm:p-14">
              <span className="orb -bottom-56 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 bg-gold/20" />
              <h2 className="font-display text-[clamp(1.9rem,4.5vw,2.9rem)] font-bold tracking-tight text-balance">
                Your handle is already a wallet.
              </h2>
              <p className="mx-auto mt-3 max-w-md text-ivory/55">
                Claim it in one tap, or pay someone who has not claimed theirs yet.
              </p>
              <div className="mt-8">
                <a href="/auth/x/login" className="btn btn-gold">
                  <XLogo size={15} /> Continue with X
                </a>
              </div>
              <PayAHandle />
            </div>
          </section>
        </Shell>
      </main>

      <Footer />
    </>
  );
}
