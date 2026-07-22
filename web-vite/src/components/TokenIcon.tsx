import { ASSET_LABEL } from "../lib/format";

// Each token gets its own bright fill and a glyph. Real symbols where they
// exist (₿, Ξ), a plain letter otherwise. Ink text over the fill = neo pop.
const TOKEN: Record<string, { bg: string; glyph: string }> = {
  CC: { bg: "#f6dfa4", glyph: "C" },
  USDCX: { bg: "#8ef0c4", glyph: "$" },
  CBTC: { bg: "#ffb266", glyph: "₿" },
  CETH: { bg: "#a6b4ff", glyph: "Ξ" },
};

export function tokenColor(asset: string): string {
  return TOKEN[asset]?.bg ?? "#b6adc4";
}

export function TokenIcon({ asset, size = 40 }: { asset: string; size?: number }) {
  const t = TOKEN[asset] ?? { bg: "#b6adc4", glyph: (ASSET_LABEL[asset] ?? asset).slice(0, 1) };
  return (
    <span
      className="token-tile"
      style={{ width: size, height: size, background: t.bg, fontSize: Math.round(size * 0.5) }}
      aria-hidden="true"
    >
      {t.glyph}
    </span>
  );
}
