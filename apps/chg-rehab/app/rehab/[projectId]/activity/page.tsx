import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { loadProjectActivity, loadProjectByCode, loadAssignedContactIds } from "@/lib/rehab/queries";
import { can } from "@/lib/permissions";
import { parseActivityMeta } from "@/lib/rehab/types";
import ActivityFeed, { type FeedEntry } from "@/components/rehab/ActivityFeed";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projectId } = await params;
  const project = await loadProjectByCode(user.companyId, decodeURIComponent(projectId));
  if (!project) notFound();
  const [raw, assignedContactIds, canPost, canApprove] = await Promise.all([
    loadProjectActivity(user.companyId, 200),
    loadAssignedContactIds(project),
    can(user, "rehab", "edit"),
    can(user, "sow", "edit"),
  ]);

  const COMPLIANCE_ACTIONS = new Set(["compliance.uploaded", "compliance.renewed"]);

  // Project-scope filter: only include entries that are directly about this
  // project, its property, or compliance events for assigned contractors.
  const entries: FeedEntry[] = raw
    .filter((e) => {
      const m = parseActivityMeta(e.meta);
      const rawMeta = e.meta as Record<string, unknown> | null;

      // Compliance events: show only when the contact is assigned to this project.
      if (COMPLIANCE_ACTIONS.has(e.action)) {
        const contactId = typeof rawMeta?.contactId === "string" ? rawMeta.contactId : null;
        return contactId !== null && assignedContactIds.has(contactId);
      }

      // Explicitly tagged with this project's ID in meta.
      if (m.projectId === project.id) return true;

      // The entry is directly about this project record.
      if (e.entity === "Project" && e.entityId === project.id) return true;

      // The entry is about the property this project belongs to.
      if (e.entity === "Property" && e.entityId === project.propertyId) return true;

      // Entries posted directly into this project's feed (notes, tasks, etc.)
      // store the project code in meta.projectCode.
      const projectCode = typeof rawMeta?.projectCode === "string" ? rawMeta.projectCode : null;
      if (projectCode === project.code) return true;

      return false;
    })
    .map((e) => {
      const m = parseActivityMeta(e.meta);
      const who = e.actor
        ? `${e.actor.firstName ?? ""} ${e.actor.lastName ?? ""}`.trim() || e.actor.email || "User"
        : "System";
      // Older change-order entries were stored with `meta.type = "task"`;
      // promote them so they pick up the new visual treatment.
      const type =
        e.action === "changeOrder.requested" ? "changeOrder" : m.type;
      return {
        id: e.id,
        type,
        who,
        action: actionLabel(e.action),
        message: e.message ?? "",
        createdAt: e.createdAt.toISOString(),
        projectCode: project.code,
        phaseNumber: m.phaseNumber,
        coStatus: m.coStatus,
      };
    });

  return (
    <div className="tab-panel active">
      <ActivityFeed
        projectCode={project.code}
        entries={entries}
        canPost={canPost}
        canApprove={canApprove}
      />
    </div>
  );
}

function actionLabel(action: string): string {
  switch (action) {
    case "draw.approved": return "approved draw payment";
    case "checklist.verified": return "verified checklist item";
    case "checklist.unverified": return "unverified checklist item";
    case "note.posted": return "added a note";
    case "task.posted": return "added a task";
    case "exception.filed": return "filed an exception";
    case "changeOrder.requested": return "requested a change order";
    case "changeOrder.approved": return "approved a change order";
    case "changeOrder.rejected": return "rejected a change order";
    case "addendum.signed": return "signed an addendum";
    case "addendum.created": return "created an addendum";
    case "phase.advanced": return "advanced to next phase";
    case "document.uploaded": return "uploaded document";
    case "contact.created": return "created a contact";
    case "compliance.uploaded": return "uploaded compliance doc";
    case "compliance.renewed": return "renewed compliance doc";
    default: return action.replace(/\./g, " ");
  }
}
