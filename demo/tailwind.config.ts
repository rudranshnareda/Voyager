import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0A0D12",
          panel: "#111318",
          card: "#191D24",
          hover: "#1E232D",
        },
        border: {
          DEFAULT: "#252A33",
          strong: "#353C4A",
        },
        accent: {
          DEFAULT: "#6366F1",
          dim: "#3D3F7A",
          glow: "#818CF8",
        },
        text: {
          primary: "#EEF0F6",
          secondary: "#7B8192",
          muted: "#4B5260",
        },
        status: {
          processing: "#F59E0B",
          ready: "#10B981",
          error: "#EF4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "var(--font-geist-mono)", "monospace"],
        inter: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
