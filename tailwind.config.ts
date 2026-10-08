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
        cream: "#F7F5EF",
        paper: "#FFFFFF",
        ink: "#202726",
        muted: "#69716E",
        racing: "#173B32",
        moss: "#54745b",
        oxblood: "#9f2d2d",
        brass: "#B69758"
      },
      boxShadow: {
        soft: "0 16px 45px rgba(24, 36, 47, 0.09)"
      }
    }
  },
  plugins: []
};

export default config;
