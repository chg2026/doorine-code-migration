"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, sans-serif",
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
            {error.message || "An unexpected error occurred."}
          </p>
          <button onClick={() => reset()} style={{ padding: "8px 16px", fontSize: 13 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
