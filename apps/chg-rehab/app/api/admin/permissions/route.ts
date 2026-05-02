import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { invalidatePermissionsCache } from "@/lib/permissions";

const VALID = new Set(["edit", "view", "none"]);

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "Admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    rows?: { id: string; pm: string; gc: string; sub: string; inspector: string }[];
  };
  if (!Array.isArray(body.rows))
    return NextResponse.json({ error: "rows[] required" }, { status: 400 });

  // All-or-nothing validation: every row must reference an existing record
  // for this company AND every per-role value must be one of edit/view/none.
  const ids = body.rows.map((r) => r.id);
  const existing = await prisma.permissionLabelRow.findMany({
    where: { companyId: user.companyId, id: { in: ids } },
  });
  const byId = new Map(existing.map((r) => [r.id, r]));

  for (const r of body.rows) {
    if (!byId.has(r.id)) {
      return NextResponse.json(
        { error: `Unknown row id: ${r.id}` },
        { status: 400 }
      );
    }
    const cur = byId.get(r.id)!;
    for (const k of ["pm", "gc", "sub", "inspector"] as const) {
      if (!VALID.has(r[k])) {
        return NextResponse.json(
          { error: `Invalid value '${r[k]}' for ${k} in row ${r.id}` },
          { status: 400 }
        );
      }
      // `locked` rows are truly immutable: payload values must equal
      // whatever the seeded row already holds.
      if (cur.locked && r[k] !== cur[k]) {
        return NextResponse.json(
          { error: `Row '${cur.label}' is locked and cannot be modified` },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(
    body.rows.map((r) => {
      const cur = byId.get(r.id)!;
      // `locked` rows are skipped at the SQL layer too: even if the payload
      // matches, we don't write because the row is permanent.
      if (cur.locked) return prisma.permissionLabelRow.update({ where: { id: r.id }, data: {} });
      return prisma.permissionLabelRow.update({
        where: { id: r.id },
        data: { pm: r.pm, gc: r.gc, sub: r.sub, inspector: r.inspector },
      });
    })
  );

  invalidatePermissionsCache(user.companyId);

  await prisma.activityLogEntry.create({
    data: {
      companyId: user.companyId,
      actorId: user.id,
      action: "admin_permissions_updated",
      entity: "PermissionLabelRow",
      meta: { count: body.rows.length },
    },
  });

  return NextResponse.json({ ok: true });
}
