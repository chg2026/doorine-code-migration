import PortalPage from "@/components/PortalPage";
import { getCurrentContractor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const c = (await getCurrentContractor())!;
  const jobs = await prisma.cpJob.findMany({
    where: { contractorId: c.id, status: { in: ["active", "upcoming", "complete"] } },
    include: { photos: true },
    orderBy: { createdAt: "desc" },
  });
  const requested = jobs.filter((j) => j.photoRequested);

  return (
    <PortalPage title="Photo uploads" subtitle="Document progress for your jobs and operators">
      {requested.length > 0 && (
        <div className="card" style={{ borderLeft: "3px solid var(--amber)" }}>
          <div className="ctitle" style={{ marginBottom: 8 }}>📸 Photo updates requested</div>
          {requested.map((j) => (
            <div key={j.id} className="fi">
              <div style={{ flex: 1 }}>
                <div className="fi-title">{j.name}</div>
                <div className="fi-sub">Operator requested progress photos</div>
              </div>
              <button className="btn btn-p btn-sm">Upload photos</button>
            </div>
          ))}
        </div>
      )}
      {jobs.map((j) => (
        <div key={j.id} className="card">
          <div className="chd"><div className="ctitle">{j.name}</div><button className="btn btn-sm">+ Add photos</button></div>
          {j.photos.length === 0 ? (
            <div className="empty-state" style={{ padding: 14 }}>No photos uploaded yet.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {j.photos.map((p) => (
                <div key={p.id} style={{ aspectRatio: "1", borderRadius: 8, background: "var(--bg2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--t2)", textAlign: "center", padding: 6 }}>
                  {p.phase}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </PortalPage>
  );
}
