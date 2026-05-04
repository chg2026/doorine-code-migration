import type { ReactNode } from "react";

export default function PortalPage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="pg-title">{title}</div>
          {subtitle ? <div className="pg-sub">{subtitle}</div> : null}
        </div>
        {actions ? <div style={{ display: "flex", gap: 8 }}>{actions}</div> : null}
      </div>
      <div className="content">{children}</div>
    </>
  );
}
