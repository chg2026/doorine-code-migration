import type { Config } from "tailwindcss";

// NOTE: The CHG Rehab UI is styled almost entirely from the prototype CSS
// (see app/globals.css). These tokens are aligned with the prototype's
// CSS variables so any incidental Tailwind utilities stay on-palette.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1B3A5C",
        "navy-dk": "#152d48",
        blue: "#185FA5",
        "blue-bg": "#E6F1FB",
        "blue-txt": "#0C447C",
        green: "#1D9E75",
        "green-bg": "#EAF3DE",
        "green-txt": "#27500A",
        amber: "#BA7517",
        "amber-bg": "#FAEEDA",
        "amber-txt": "#633806",
        red: "#A32D2D",
        "red-bg": "#FCEBEB",
        "red-txt": "#791F1F",
        "purple-bg": "#EEEDFE",
        "purple-txt": "#3C3489",
        "text-primary": "#0f172a",
        "text-secondary": "#64748b",
        "text-tertiary": "#94a3b8",
        "bg-primary": "#ffffff",
        "bg-secondary": "#f8fafc",
        "bg-tertiary": "#f1f5f9",
        "border-lo": "rgba(15,23,42,0.10)",
        "border-mid": "rgba(15,23,42,0.22)",
        "border-hi": "rgba(15,23,42,0.40)",
        "page-bg": "#eef2f7",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      fontSize: {
        // Prototype defaults to 13px body
        base: ["13px", "1.5"],
      },
    },
  },
  plugins: [],
};
export default config;
