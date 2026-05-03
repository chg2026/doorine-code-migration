// Pages-router stub — forces Next 15 to skip auto-synthesizing an _error
// page. Without this, the auto-synth grabs a React copy that resolves to
// null in our prerender pipeline (`Cannot read properties of null (reading
// 'useContext')`). The app router `not-found.tsx` is what users actually
// see; this file only exists to satisfy the build's static export step.
function ErrorPage({ statusCode }: { statusCode: number }) {
  return (
    <div style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 18 }}>{statusCode || "Error"}</h1>
      <p style={{ fontSize: 13, color: "#666" }}>
        Something went wrong. <a href="/dashboard">Return to dashboard</a>.
      </p>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: { res?: { statusCode?: number }; err?: { statusCode?: number } }) => {
  const statusCode = res?.statusCode || err?.statusCode || 404;
  return { statusCode };
};

export default ErrorPage;
