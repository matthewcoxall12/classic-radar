import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        cream: "#f7f1e7",
        paper: "#fffaf2",
        ink: "#18242f",
        muted: "#5d6872",
        racing: "#0f5132",
        moss: "#54745b",
        oxblood: "#9f2d2d",
        brass: "#b9852b"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(24, 36, 47, 0.09)"
      }
    }
  },
  plugins: []
};

export default config;
