import { useRef } from "react";
import { Link } from "react-router-dom";

/** The echo-send mark: three arrows, each a fainter echo of the last. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="selkie-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F6DFA4" />
          <stop offset="1" stopColor="#C9964B" />
        </linearGradient>
      </defs>
      <g strokeLinejoin="round" strokeWidth="7">
        <path d="M 9 17 L 9 47 L 35 32 Z" fill="#F2EBDC" stroke="#F2EBDC" opacity="0.18" />
        <path d="M 19 17 L 19 47 L 45 32 Z" fill="#F2EBDC" stroke="#F2EBDC" opacity="0.42" />
        <path d="M 29 17 L 29 47 L 55 32 Z" fill="url(#selkie-mark)" stroke="url(#selkie-mark)" />
      </g>
    </svg>
  );
}

export function Wordmark({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <Mark />
      <span className="font-body text-xs font-extrabold tracking-mark">SELKIE</span>
    </Link>
  );
}

/**
 * The 3D echo hero: a floating gold medallion carrying the mark, sonar-like
 * echo rings radiating out, and a soft glow beneath. Tilts toward the cursor
 * so the whole thing reads as an object lit from below, not a flat logo.
 */
export function EchoHero() {
  const medallion = useRef<HTMLDivElement>(null);

  function tilt(e: React.MouseEvent<HTMLDivElement>) {
    const el = medallion.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 18}deg)`;
  }
  function reset() {
    if (medallion.current) medallion.current.style.transform = "";
  }

  return (
    <div className="echo-stage" onMouseMove={tilt} onMouseLeave={reset}>
      <span className="echo-glow" />
      <span className="echo-ring" />
      <span className="echo-ring" style={{ animationDelay: "1.2s" }} />
      <span className="echo-ring" style={{ animationDelay: "2.4s" }} />

      <div ref={medallion} className="echo-medallion">
        <svg width="52%" viewBox="0 0 64 64" aria-hidden="true" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="hero-mark" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F6DFA4" />
              <stop offset="1" stopColor="#C9964B" />
            </linearGradient>
          </defs>
          <g strokeLinejoin="round" strokeWidth="6">
            <path d="M 9 17 L 9 47 L 35 32 Z" fill="#F2EBDC" stroke="#F2EBDC" opacity="0.2" />
            <path d="M 19 17 L 19 47 L 45 32 Z" fill="#F2EBDC" stroke="#F2EBDC" opacity="0.45" />
            <path d="M 29 17 L 29 47 L 55 32 Z" fill="url(#hero-mark)" stroke="url(#hero-mark)" />
          </g>
        </svg>
      </div>
    </div>
  );
}
