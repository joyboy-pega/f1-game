/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        racing: {
          red: "#e10600",
          yellow: "#ffd700",
          cyan: "#00d2be",
          green: "#00d26a",
          purple: "#9b51e0",
          dark: "#0b0e14",
          panel: "#121721",
          border: "#1f293d",
        },
      },
      fontFamily: {
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        racing: ["var(--font-racing)", "Impact", "sans-serif"],
      },
    },
  },
  plugins: [],
};
