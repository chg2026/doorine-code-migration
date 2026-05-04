import type { Config } from "tailwindcss";

// Colour tokens mirror the Vestry prototype (attached_assets/vestry-investor-portal_*.html)
// so any incidental Tailwind utilities stay on-palette with the hand-written CSS in
// app/globals.css.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        teal: "#0F6E56",
        "teal-light": "#E1F5EE",
        "teal-mid": "#1D9E75",
        "teal-dark": "#085041",
        blue: "#185FA5",
        "blue-light": "#E6F1FB",
        "blue-mid": "#378ADD",
        purple: "#534AB7",
        "purple-light": "#EEEDFE",
        amber: "#854F0B",
        "amber-light": "#FAEEDA",
        red: "#A32D2D",
        "red-light": "#FCEBEB",
        green: "#3B6D11",
        "green-light": "#EAF3DE",
        "text-primary": "#1a1916",
        "text-secondary": "#6b6a66",
        "text-tertiary": "#a09e99",
        "bg-primary": "#ffffff",
        "bg-secondary": "#f7f7f5",
        "bg-tertiary": "#f0ede8",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "SF Pro Text",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
