/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08070c",
        panel: "#0e0c14",
        ivory: "#f4f1ea",
        muted: "#a8a294",
        gold: {
          light: "#f6dfa4",
          DEFAULT: "#d9a85c",
          deep: "#c9964b",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 700ms cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};
