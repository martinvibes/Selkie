import type { ReactNode } from "react";
import { Wordmark } from "./Mark";
import { useAuth } from "../contexts/useAuth";

export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-5 sm:px-8">{children}</div>;
}

export function Header() {
  const { me } = useAuth();
  return (
    <header className="py-5">
      <Shell>
        <div className="flex items-center justify-between gap-4">
          <Wordmark to={me ? "/dashboard/activity" : "/"} />
          {me ? (
            <div className="flex items-center gap-4 text-[0.8125rem]">
              <span className="text-ivory/50">{me.handle}</span>
              <a
                href="/auth/logout"
                className="border-b border-transparent text-ivory/50 transition hover:border-ivory/20 hover:text-ivory"
              >
                Sign out
              </a>
            </div>
          ) : (
            <a href="/auth/x/login" className="btn-ghost !px-4 !py-2 text-xs">
              Continue with X
            </a>
          )}
        </div>
      </Shell>
    </header>
  );
}

export function Waterline({ full = false }: { full?: boolean }) {
  // Full-bleed on the landing so it reads as a horizon, contained elsewhere.
  return full ? (
    <div className="waterline" />
  ) : (
    <Shell>
      <div className="waterline" />
    </Shell>
  );
}

export function Spinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-ivory/15 border-t-gold" />
    </div>
  );
}
