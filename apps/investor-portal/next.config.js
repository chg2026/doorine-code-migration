/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    // Cross-product URLs consumed by AppSwitcher tiles. Each is optional —
    // when unset, AppSwitcher falls back to the Replit dev-preview heuristic
    // (same-host for chg, devPort:3001/3003 for the others).
    NEXT_PUBLIC_CHG_URL: process.env.NEXT_PUBLIC_CHG_URL,
    NEXT_PUBLIC_DEALLINK_URL: process.env.NEXT_PUBLIC_DEALLINK_URL,
    NEXT_PUBLIC_INVESTOR_URL: process.env.NEXT_PUBLIC_INVESTOR_URL,
    NEXT_PUBLIC_CONTRACTOR_URL: process.env.NEXT_PUBLIC_CONTRACTOR_URL,
  },
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
