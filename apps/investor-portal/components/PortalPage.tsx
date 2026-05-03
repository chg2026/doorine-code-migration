import type { ReactNode } from "react";

export default function PortalPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <>
      <div className="topbar">
        <div>
          <div className="pg-title">{title}</div>
          {subtitle ? <div className="pg-sub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="content">{children}</div>
    </>
  );
}
