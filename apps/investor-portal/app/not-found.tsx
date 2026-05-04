export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
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
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>Page not found</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <a href="/dashboard" style={{ marginTop: 16, fontSize: 13 }}>
        Go to dashboard
      </a>
    </div>
  );
}
