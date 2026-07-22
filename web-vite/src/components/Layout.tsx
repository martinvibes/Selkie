import type { ReactNode } from "react";
import { Wordmark } from "./Mark";
import { useAuth } from "../contexts/useAuth";

/** The rounded window every page sits inside (gold-lit deep + grid behind). */
export function Frame({ children }: { children: ReactNode }) {
  return <div className="frame">{children}</div>;
}

export function Shell({ children }: { children: ReactNode }) {
  return <div className="shell">{children}</div>;
}

export function Header() {
  const { me } = useAuth();
  return (
    <header className="py-5 sm:py-6">
      <Shell>
        <div className="flex items-center justify-between gap-4">
          <Wordmark to={me ? "/dashboard/activity" : "/"} />
          {me ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-xs font-bold text-muted sm:inline">{me.handle}</span>
              <a href="/auth/logout" className="btn-ghost !min-h-0 !px-4 !py-2 text-xs">
                Sign out
              </a>
            </div>
          ) : (
            <a href="/auth/x/login" className="btn-primary !min-h-0 !px-4 !py-2 text-xs">
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
    <Frame>
      <div className="flex min-h-[80vh] items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-ivory/15 border-t-gold" />
      </div>
    </Frame>
  );
}
