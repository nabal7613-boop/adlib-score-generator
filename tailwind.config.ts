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
        moss: "#1ed760",
        ink: "#0a0a0a",
        graphite: "#1a1a1a",
        fern: "#1aa34a",
        line: "rgba(255,255,255,0.08)",
      },
      boxShadow: {
        glow: "0 0 40px rgba(30,215,96,0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
