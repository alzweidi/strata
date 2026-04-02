import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        strata: {
          bg: "#0D0D0D",
          surface: "#111111",
          border: "#1E1E1E",
          accent: "#00FF88",
          secondary: "#00C8FF",
          warning: "#FFB800",
          danger: "#FF4444",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

