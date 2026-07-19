/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0912",
        deep: "#060a12",
        abyss: "#04070d",
        gold: {
          light: "#f6dfa4",
          DEFAULT: "#d9a85c",
          deep: "#c9964b",
        },
        ivory: "#f2ebdc",
      },
      fontFamily: {
        ui: ['"Avenir Next"', '"Helvetica Neue"', "system-ui", "-apple-system", "sans-serif"],
        num: ["ui-monospace", '"SF Mono"', "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        mark: "0.34em",
        label: "0.16em",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "none" },
        },
        draw: {
          from: { opacity: "0", transform: "scaleX(0)" },
          to: { opacity: "1", transform: "scaleX(1)" },
        },
        drift: {
          from: { backgroundPosition: "-45% 0" },
          to: { backgroundPosition: "145% 0" },
        },
      },
      animation: {
        rise: "rise 700ms cubic-bezier(0.16,1,0.3,1) both",
        draw: "draw 900ms cubic-bezier(0.16,1,0.3,1) both",
        drift: "drift 14s linear infinite",
      },
    },
  },
  plugins: [],
};
