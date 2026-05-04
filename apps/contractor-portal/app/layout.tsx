import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CHG Contractor Portal",
  description: "Manage your jobs, quotes, invoices, and compliance — all in one place.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
