type Badge = { label: string; tone?: "default" | "blue" | "green" | "amber" };

export default function ModuleStub({
  title,
  description,
  badges,
}: {
  title: string;
  description: string;
  badges?: (Badge | string)[];
}) {
  const normalized: Badge[] = (badges ?? []).map((b) =>
    typeof b === "string" ? { label: b } : b
  );
  return (
    <>
      <div className="proj-bar">
        <div className="proj-l">
          <div className="proj-addr">{title}</div>
          <span className="proj-chip">Module</span>
        </div>
        <div className="proj-r">
          <span className="proj-mode">Foundation</span>
          <button className="btn">Filter</button>
          <button className="btn-primary">+ New</button>
        </div>
      </div>

      <div className="kpi-strip">
        {normalized.slice(0, 4).map((b) => (
          <div key={b.label} className="kpi-card">
            <div className="kpi-label">{b.label.split(":")[0] || "Stat"}</div>
            <div className={`kpi-val ${b.tone === "amber" ? "amber" : b.tone === "green" ? "green" : ""}`}>
              {b.label.includes(":") ? b.label.split(":").slice(1).join(":").trim() : b.label}
            </div>
          </div>
        ))}
      </div>

      <div className="body-split">
        <div className="body-main">
          <div className="sec-hd">Overview</div>
          <div style={{ padding: 16, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {description}
            <div style={{ marginTop: 10, color: "var(--text-tertiary)", fontSize: 11 }}>
              Module shell ready. Detail screens land in the next round of tasks.
            </div>
          </div>
        </div>
        <aside className="body-side">
          <div className="sb-sec">
            <div className="sb-hd">Status</div>
            <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {normalized.map((b) => (
                <span
                  key={b.label}
                  className={
                    b.tone === "green"
                      ? "cell-tag tag-paid"
                      : b.tone === "amber"
                      ? "cell-tag tag-pend"
                      : b.tone === "blue"
                      ? "cell-tag tag-system"
                      : "ctag tag-misc"
                  }
                  style={{ alignSelf: "flex-start" }}
                >
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
