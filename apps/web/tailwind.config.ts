import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: "#0b0f16",
        surface: {
          "1": "#0f172a",
          "2": "#111827",
        },
        border: "#1f2937",
        primary: "#f8fafc",
        secondary: "#94a3b8",
        accent: {
          cyan: "#22d3ee",
          emerald: "#34d399",
          amber: "#fbbf24",
          red: "#f87171",
        },
      },
      borderRadius: {
        panel: "1rem",
        modal: "1.25rem",
        pill: "999px",
      },
      boxShadow: {
        modal: "0 0 0 1px rgba(148, 163, 184, 0.12), 0 24px 48px rgba(0, 0, 0, 0.6)",
        selected: "0 0 0 1px rgba(45, 212, 191, 0.5), 0 0 24px rgba(45, 212, 191, 0.35)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
