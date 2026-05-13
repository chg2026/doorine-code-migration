"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function BillingSuccessPage() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.push("/settings/team");
    }, 3000);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg-base, #f9fafb)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          border: "1px solid var(--border-mid, #e5e7eb)",
          borderRadius: 8,
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#dcfce7",
            color: "#166534",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 28,
            fontWeight: 700,
            margin: "0 auto 16px",
          }}
        >
          ✓
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 600 }}>
          You&apos;re now on the Team plan! Your team seats are ready.
        </h1>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 13,
            color: "var(--text-tertiary, #6b7280)",
          }}
        >
          Redirecting you to Team Settings in a few seconds…
        </p>
        <Link
          href="/settings/team"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 4,
            border: "1px solid #111827",
            background: "#111827",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          Go to Team Settings
        </Link>
      </div>
    </div>
  );
}
