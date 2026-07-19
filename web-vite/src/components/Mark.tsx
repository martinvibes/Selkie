import { Link } from "react-router-dom";

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
      <span className="text-xs font-extrabold tracking-mark">SELKIE</span>
    </Link>
  );
}
