import type { Config } from "tailwindcss";

/**
 * CHG Contractor Portal — Tailwind theme.
 *
 * The design system is expressed entirely as Tailwind theme tokens
 * (colors / radii / fonts / spacing). Reusable components in
 * `app/globals.css` are built with `@apply` against these tokens, so
 * pages can either compose utilities (`bg-coral text-white`) or use
 * the named component classes (`btn btn-p`, `kpi`, `card`, …) without
 * any raw CSS — and both surfaces always stay on-palette.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surface
        bg1: "#ffffff",
        bg2: "#f7f6f3",
        bg3: "#f0ede8",
        // Text
        t1: "#1a1916",
        t2: "#6b6a66",
        t3: "#a09e99",
        // Brand + status
        coral: "#D85A30",
        "coral-light": "#FAECE7",
        "coral-dark": "#712B13",
        teal: "#0F6E56",
        "teal-light": "#E1F5EE",
        "teal-mid": "#1D9E75",
        "teal-dark": "#085041",
        blue: "#185FA5",
        "blue-light": "#E6F1FB",
        "blue-mid": "#378ADD",
        "blue-dark": "#0C447C",
        purple: "#534AB7",
        "purple-light": "#EEEDFE",
        "purple-dark": "#3C3489",
        amber: "#854F0B",
        "amber-light": "#FAEEDA",
        "amber-dark": "#633806",
        red: "#A32D2D",
        "red-light": "#FCEBEB",
        green: "#3B6D11",
        "green-light": "#EAF3DE",
        "gray-soft": "#F1EFE8",
        // Aliases used by older code
        "text-primary": "#1a1916",
        "text-secondary": "#6b6a66",
        "text-tertiary": "#a09e99",
      },
      borderRadius: {
        // Match the prototype's --r and --rl tokens
        DEFAULT: "8px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      fontFamily: {
        sans: ["-apple-system", "SF Pro Text", "Helvetica Neue", "Arial", "sans-serif"],
      },
      borderWidth: { hair: "0.5px" },
    },
  },
  plugins: [],
};
export default config;
