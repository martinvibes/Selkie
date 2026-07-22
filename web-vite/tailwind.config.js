/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Dark-but-not-black surfaces, so hard black offsets read as shadow.
        ink: "#0b0912",
        night: "#14101e",
        panel: "#1c1730",
        raised: "#241d3a",
        line: "#f2ebdc",
        ivory: "#f2ebdc",
        muted: "#b6adc4",
        gold: {
          light: "#f6dfa4",
          DEFAULT: "#d9a85c",
          deep: "#c9964b",
        },
        // Per-token identities: bright flat fills, ink text (neo pop).
        cc: "#f6dfa4",
        usdcx: "#8ef0c4",
        cbtc: "#ffb266",
        ceth: "#a6b4ff",
      },
      fontFamily: {
        display: ['"Big Shoulders Display"', "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Unbounded", "ui-sans-serif", "system-ui", "sans-serif"],
        num: ["Unbounded", "ui-monospace", "monospace"],
      },
      letterSpacing: {
        mark: "0.34em",
        label: "0.18em",
      },
      boxShadow: {
        neo: "4px 5px 0 #000",
        "neo-sm": "2px 3px 0 #000",
        "neo-lg": "7px 8px 0 #000",
        "neo-gold": "4px 5px 0 #c9964b",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "none" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-12px)" },
        },
        echo: {
          "0%": { opacity: "0.55", transform: "translate(-50%,-50%) scale(0.35)" },
          "80%": { opacity: "0" },
          "100%": { opacity: "0", transform: "translate(-50%,-50%) scale(1.9)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(calc(-50% - 0.5rem))" },
        },
        sheen: {
          from: { backgroundPosition: "-30% 0" },
          to: { backgroundPosition: "130% 0" },
        },
      },
      animation: {
        rise: "rise 640ms cubic-bezier(0.16,1,0.3,1) both",
        float: "float 6s ease-in-out infinite",
        echo: "echo 3.6s ease-out infinite",
        marquee: "marquee 46s linear infinite",
        sheen: "sheen 8s linear infinite",
      },
    },
  },
  plugins: [],
};
