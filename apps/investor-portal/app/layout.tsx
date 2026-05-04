import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vestry Capital — Investor Portal",
  description: "Track your real estate investments, distributions, and documents.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
