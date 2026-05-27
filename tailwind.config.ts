import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#060807",
        moss: "#1ed760",
        fern: "#16a34a",
        graphite: "#151918",
        line: "rgba(255,255,255,0.12)"
      },
      boxShadow: {
        glow: "0 0 50px rgba(30, 215, 96, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
