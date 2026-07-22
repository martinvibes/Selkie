import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { LoaderMark, Mark, Wordmark, XLogo } from "./Mark";
import { useAuth } from "../contexts/useAuth";
import type { Me } from "../lib/api";

export function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full px-5 sm:px-8 ${wide ? "max-w-6xl" : "max-w-2xl"}`}>{children}</div>
  );
}

export function Avatar({ me, size = 32 }: { me: Me; size?: number }) {
  const initial = me.handle.replace(/^@/, "").slice(0, 1).toUpperCase();
  return me.avatar ? (
    <img
      src={me.avatar}
      alt=""
      referrerPolicy="no-referrer"
      className="rounded-full object-cover ring-1 ring-white/15"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="grid place-items-center rounded-full bg-gradient-to-br from-gold-light to-gold-deep font-display font-bold text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Signing out is reversible but surprising when accidental, so it asks. */
function SignOutModal({ handle, onClose }: { handle: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal glass-strong p-7"
        role="dialog"
        aria-modal="true"
        aria-label="Sign out"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-xl font-semibold">Sign out of {handle}?</p>
        <p className="mt-2 text-sm leading-relaxed text-ivory/55">
          Your wallet stays safe on Canton. Signing back in with X brings it right back.
        </p>
        <div className="mt-6 flex gap-3">
          <button onClick={onClose} autoFocus className="btn btn-dim flex-1">
            Cancel
          </button>
          <a href="/auth/logout" className="btn btn-danger flex-1">
            Sign out
          </a>
        </div>
      </div>
    </div>
  );
}

export function Header() {
  const { me } = useAuth();
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink/70 backdrop-blur-xl">
      <Shell wide>
        <div className="flex h-16 items-center justify-between gap-4">
          <Wordmark />
          {me ? (
            <div className="flex items-center gap-3">
              <Link
                to="/dashboard/activity"
                className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 transition hover:border-white/25 hover:bg-white/[0.08]"
              >
                <Avatar me={me} size={26} />
                <span className="text-sm font-medium text-ivory/80">{me.handle}</span>
              </Link>
              <button onClick={() => setConfirmOut(true)} className="btn btn-dim btn-sm">
                Sign out
              </button>
            </div>
          ) : (
            <a href="/auth/x/login" className="btn btn-dim btn-sm">
              <XLogo size={13} /> Continue with X
            </a>
          )}
        </div>
      </Shell>
      {confirmOut && me && <SignOutModal handle={me.handle} onClose={() => setConfirmOut(false)} />}
    </header>
  );
}

export function Footer() {
  return (
    <footer className="mt-28 border-t border-white/[0.06] py-10">
      <Shell wide>
        <div className="flex flex-col items-center justify-between gap-4 text-sm text-ivory/40 sm:flex-row">
          <span className="flex items-center gap-2.5">
            <Mark size={18} />
            <span className="font-display font-semibold text-ivory/70">Selkie</span>
          </span>
          <span>Private payments on Canton · HackCanton S2</span>
        </div>
      </Shell>
    </footer>
  );
}

/** Full-screen branded loader: the echo mark pulsing over a sweeping gold bar. */
export function Spinner() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5">
      <LoaderMark size={46} />
      <div className="loader-bar" />
    </div>
  );
}
