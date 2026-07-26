import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  BookOpen,
  Coins,
  EyeOff,
  Globe,
  Layers,
  Lock,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Footer, Header, Shell, Spinner } from "../components/Layout";
import { XLogo } from "../components/Mark";
import { Reveal } from "../components/Reveal";
import { TokenIcon } from "../components/TokenIcon";
import { useAuth } from "../contexts/useAuth";

/** A command chip, styled to match the docs. */
function Cmd({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md border-2 border-pen/12 bg-[#f2e6cc] px-1.5 py-0.5 font-mono text-[0.85em] font-semibold text-gold-ink">
      {children}
    </code>
  );
}

/** Section eyebrow + heading, on the open water. */
function Lead({ eyebrow, title, sub }: { eyebrow: string; title: ReactNode; sub?: ReactNode }) {
  return (
    <Reveal>
      <p className="eyebrow text-gold">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-bold tracking-tight text-ivory sm:text-4xl text-balance">
        {title}
      </h2>
      {sub && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ivory/65">{sub}</p>}
    </Reveal>
  );
}

const SURFACES = [
  {
    icon: <XLogo size={17} />,
    tag: "On X",
    title: "Pay from the timeline",
    body: "Reply to a post or mention @SelkiePay with what you want to do. Selkie settles it on Canton and replies with a private receipt. This is where Selkie started.",
    demo: <Cmd>@SelkiePay send 5 CC to @ada</Cmd>,
  },
  {
    icon: <MessageCircle size={17} />,
    tag: "On Telegram",
    title: "Pay from a chat",
    body: "Open @selkiepay_bot and tap start. Your Telegram username is your wallet, with a button bar, a slash-command menu and inline Pay or Decline buttons on requests.",
    demo: <Cmd>send 10 USDCx to @ada</Cmd>,
  },
  {
    icon: <Wallet size={17} />,
    tag: "On the web",
    title: "The full dashboard",
    body: "Sign in with X for balances, send, requests and activity, plus a shareable pay page for any handle, so a handle can be paid before it even has a wallet.",
    demo: <Cmd>selkiepay.vercel.app</Cmd>,
  },
];

const WHY_CANTON = [
  {
    icon: <EyeOff size={18} />,
    t: "Privacy is native",
    d: "A payment is shared only with the two people in it, enforced by the ledger, not promised in a policy. A consumer wallet has to keep balances private. On Canton that is the default, not a bolt-on.",
  },
  {
    icon: <Coins size={18} />,
    t: "Real, interoperable assets",
    d: "Canton Coin is native, and Bitcoin and Ether arrive as cBTC and cETH through one shared token standard. Selkie speaks that standard, so every asset moves through the same path.",
  },
  {
    icon: <Zap size={18} />,
    t: "Settlement without gas games",
    d: "Payments settle deterministically. There is no public mempool to front-run and no gas auction to lose money in. That is what lets a handle-to-handle payment feel instant.",
  },
];

const PROOF = [
  { icon: <ShieldCheck size={16} />, t: "Live on Canton DevNet", d: "Not a demo stub. The wallet runs on the real network today." },
  { icon: <Layers size={16} />, t: "Every transfer is on-ledger", d: "Each settlement has an updateId on the JSON Ledger API v2." },
  { icon: <Lock size={16} />, t: "Open reserve, no login", d: "GET /api/reserve proves the cBTC and cETH holdings to anyone." },
  { icon: <Sparkles size={16} />, t: "No mocks", d: "Balances read straight from the ledger, never a cache." },
];

const VISION = [
  { icon: <TrendingUp size={16} />, t: "Prediction markets", d: "Back your take with your balance and settle privately in cBTC, cETH or CC." },
  { icon: <Users size={16} />, t: "Group savings pools", d: "Handle-based rotating pots, the savings circles millions trust, now instant and private." },
  { icon: <Globe size={16} />, t: "Cross-border by handle", d: "Send money home to a handle in a digital dollar, with no exchange and no wire." },
  { icon: <Store size={16} />, t: "Handle as a storefront", d: "One pay-link turns any handle into a private way to get paid." },
];

export function Pitch() {
  const { me, loading } = useAuth();

  if (loading) return <Spinner />;

  const cta = me ? (
    <Link to="/dashboard/activity" className="btn btn-gold">
      Open your wallet <ArrowRight size={16} />
    </Link>
  ) : (
    <a href="/auth/x/login" className="btn btn-gold">
      <XLogo size={15} /> Continue with X
    </a>
  );

  return (
    <>
      <Header />

      <main className="pb-8 pt-6 sm:pt-10">
        <Shell wide>
          {/* ---- hero ---- */}
          <section className="pt-8 sm:pt-14">
            <Reveal>
              <span className="chunk inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-bold">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-gold-deep" />
                The pitch · HackCanton Season 2
              </span>
              <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.7rem,6.2vw,4.6rem)] font-bold leading-[1.03] tracking-[-0.03em] text-ivory text-balance">
                The wallet is already yours.
                <br />
                <span className="text-gold-grad">It is just your handle.</span>
              </h1>
              <p className="mt-6 max-w-xl text-[1.05rem] leading-relaxed text-ivory/70">
                Selkie turns any X or Telegram handle into a private wallet on the Canton Network.
                Send CC, USDCx, cBTC or cETH to @anyone. No app, no seed phrase, no gas, no public
                balance. If they have never used Selkie, your payment opens their wallet the moment
                it lands.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3.5">
                {cta}
                <a
                  href="https://selkiepay.vercel.app"
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-dim"
                >
                  See it live <ArrowUpRight size={16} />
                </a>
                <Link
                  to="/docs"
                  className="text-sm font-semibold text-ivory/70 underline-offset-4 hover:text-ivory hover:underline"
                >
                  Read the docs
                </Link>
              </div>
            </Reveal>
          </section>

          {/* ---- the problem ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="The problem"
              title="Crypto keeps losing normal people at the same wall."
              sub="Two walls, actually. Most people quit at the first. The ones who make it past hit the second and never notice what it costs them."
            />
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Reveal variant="left">
                <div className="chunk h-full p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                    <Lock size={19} />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-bold">The friction wall</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-pen/65">
                    Install a wallet. Write down twelve words. Buy gas. Then paste a
                    forty-character address you cannot read and hope you got it right. It is a lot
                    of homework just to send a friend five dollars, and most people quit right here.
                  </p>
                </div>
              </Reveal>
              <Reveal variant="right" delay={120}>
                <div className="chunk h-full p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                    <EyeOff size={19} />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-bold">The privacy wall</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-pen/65">
                    The apps that finally remove that friction run on transparent chains. So every
                    tip, every balance, every payment turns into public feed data that anyone can
                    read forever. You get ease or you get privacy. Almost nobody gives you both.
                  </p>
                </div>
              </Reveal>
            </div>
          </section>

          {/* ---- the solution ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="The solution"
              title={
                <>
                  Your handle is the wallet.
                  <br className="hidden sm:block" /> The ledger keeps it private.
                </>
              }
              sub="Selkie removes both walls at once, because it was built on the one network where privacy is the default and real assets are native."
            />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: <AtSign size={19} />,
                  t: "The handle is the address",
                  d: "There is nothing to install and nothing to back up. Your @name is the account.",
                },
                {
                  icon: <EyeOff size={19} />,
                  t: "Private by default",
                  d: "Amounts and balances are visible only to the two people in a payment. No public feed.",
                },
                {
                  icon: <Sparkles size={19} />,
                  t: "The payment is the onboarding",
                  d: "Pay someone new and the payment itself opens their wallet. The money is already theirs.",
                },
              ].map((c, i) => (
                <Reveal key={c.t} delay={i * 120} variant={i === 0 ? "left" : i === 1 ? "pop" : "right"}>
                  <div className="chunk h-full p-7">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                      {c.icon}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-bold">{c.t}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-pen/65">{c.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            {/* the one-line thesis */}
            <Reveal variant="pop">
              <div className="chunk-gold mt-6 overflow-hidden p-8 text-center sm:p-12">
                <p className="eyebrow text-gold-ink/70">The whole product</p>
                <p className="mt-3 font-mono text-[clamp(1.4rem,4vw,2.2rem)] font-bold text-pen">
                  send 5 CC to @ada
                </p>
                <p className="mx-auto mt-4 max-w-md font-medium text-pen/70">
                  That is the entire thing. One line moves money to a name. If @ada is new, her
                  wallet appears mid-payment.
                </p>
              </div>
            </Reveal>
          </section>

          {/* ---- three surfaces ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="Three ways in, one wallet"
              title="Wherever people already talk, Selkie can pay."
              sub="X, Telegram and the web share one wallet grammar. Learn it once and it works on every surface."
            />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {SURFACES.map((s, i) => (
                <Reveal key={s.tag} delay={i * 120} variant="pop">
                  <div className="chunk chunk-pop flex h-full flex-col p-7">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                      {s.icon}
                    </span>
                    <p className="eyebrow mt-5 text-gold-ink/70">{s.tag}</p>
                    <h3 className="mt-1 font-display text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 flex-1 text-sm font-medium leading-relaxed text-pen/65">{s.body}</p>
                    <div className="mt-4">{s.demo}</div>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ---- why canton ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="Why Canton"
              title="Three things a payments app cannot fake."
              sub="Selkie needs real privacy, real assets and settlement a normal person never has to think about. Canton is the network that offers all three at once."
            />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {WHY_CANTON.map((c, i) => (
                <Reveal key={c.t} delay={i * 120} variant="pop">
                  <div className="chunk h-full p-7">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                      {c.icon}
                    </span>
                    <h3 className="mt-5 font-display text-lg font-bold">{c.t}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-pen/65">{c.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ---- proof ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="Proof it is real"
              title="Not a slideshow. A live wallet on Canton."
              sub="Everything on this page settles on real Canton contracts today."
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROOF.map((p, i) => (
                <Reveal key={p.t} delay={i * 90} variant="pop">
                  <div className="chunk h-full p-5">
                    <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                      {p.icon}
                    </span>
                    <p className="mt-3 text-sm font-bold">{p.t}</p>
                    <p className="mt-1 text-[13px] font-medium leading-relaxed text-pen/55">{p.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>

            <Reveal>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {["CC", "USDCX", "CBTC", "CETH"].map((a) => (
                  <span
                    key={a}
                    className="chunk inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-bold"
                  >
                    <TokenIcon asset={a} size={20} />
                    {a === "CC" ? "Canton Coin" : a === "USDCX" ? "USDCx" : a === "CBTC" ? "cBTC" : "cETH"}
                  </span>
                ))}
              </div>
            </Reveal>
          </section>

          {/* ---- vision ---- */}
          <section className="pt-24">
            <Lead
              eyebrow="Where this goes"
              title="A handle that pays is a platform, not a feature."
              sub="Once a handle is an account and privacy is the default, the same foundation opens onto much bigger things."
            />
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {VISION.map((v, i) => (
                <Reveal key={v.t} delay={i * 90} variant="pop">
                  <div className="chunk chunk-pop h-full p-5">
                    <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-pen bg-[#f7ecd2] text-gold-ink">
                      {v.icon}
                    </span>
                    <p className="mt-3 text-sm font-bold">{v.t}</p>
                    <p className="mt-1 text-[13px] font-medium leading-relaxed text-pen/55">{v.d}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>

          {/* ---- closing CTA ---- */}
          <section className="pt-24">
            <Reveal variant="pop">
              <div className="chunk-gold overflow-hidden p-10 text-center sm:p-14">
                <h2 className="font-display text-[clamp(1.9rem,4.5vw,2.9rem)] font-bold tracking-tight text-pen text-balance">
                  Your handle is already a wallet.
                </h2>
                <p className="mx-auto mt-3 max-w-md font-medium text-pen/70">
                  Claim it in one tap, or pay someone who has not claimed theirs yet. It settles on
                  Canton in seconds, and it stays private.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-3.5">
                  {cta}
                  <Link to="/docs" className="btn btn-dark">
                    <BookOpen size={16} /> Read the docs
                  </Link>
                </div>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-pen/70">
                  <a
                    href="https://t.me/selkiepay_bot"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-pen"
                  >
                    <Send size={14} /> @selkiepay_bot
                  </a>
                  <a
                    href="https://x.com/SelkiePay"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-pen"
                  >
                    <XLogo size={13} /> @SelkiePay
                  </a>
                  <a
                    href="https://github.com/martinvibes/Selkie"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 hover:text-pen"
                  >
                    GitHub
                  </a>
                </div>
              </div>
            </Reveal>
          </section>
        </Shell>
      </main>

      <Footer />
    </>
  );
}
