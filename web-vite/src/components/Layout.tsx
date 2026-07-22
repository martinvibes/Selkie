import type { ReactNode } from "react";
import { Mark, Wordmark, XLogo } from "./Mark";
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

export function Header() {
  const { me } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink/70 backdrop-blur-xl">
      <Shell wide>
        <div className="flex h-16 items-center justify-between gap-4">
          <Wordmark to={me ? "/dashboard/activity" : "/"} />
          {me ? (
            <div className="flex items-center gap-3">
              <Avatar me={me} size={30} />
              <span className="hidden text-sm text-ivory/60 sm:inline">{me.handle}</span>
              <a href="/auth/logout" className="btn btn-dim btn-sm">
                Sign out
              </a>
            </div>
          ) : (
            <a href="/auth/x/login" className="btn btn-dim btn-sm">
              <XLogo size={13} /> Continue with X
            </a>
          )}
        </div>
      </Shell>
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

export function Spinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-ivory/15 border-t-gold" />
    </div>
  );
}
