import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getCompanySettings } from "@/lib/companySettings";
import { can } from "@/lib/permissions";
import WarehouseClient from "./Client";

export const dynamic = "force-dynamic";

export default async function WarehousePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "warehouse", "view"))) redirect("/");

  const [departments, templates, settings, canEdit, canManage, allDeptsForManager] = await Promise.all([
    prisma.warehouseDepartment.findMany({
      where: { companyId: user.companyId, hidden: false },
      include: {
        subcategories: {
          where: { hidden: false },
          orderBy: [{ pinned: "desc" }, { order: "asc" }],
          include: {
            items: {
              orderBy: { name: "asc" },
              include: { project: { select: { code: true } } },
            },
          },
        },
      },
      orderBy: [{ pinned: "desc" }, { order: "asc" }],
    }),
    prisma.warehouseTemplate.findMany({
      where: { companyId: user.companyId },
      orderBy: [{ isDefault: "desc" }, { isLocked: "desc" }, { name: "asc" }],
    }),
    getCompanySettings(user.companyId),
    can(user, "warehouse", "edit"),
    can(user, "warehouse", "admin"),
    // All (incl. hidden) departments/subs for the Category Manager — folded
    // into the same Promise.all to eliminate a sequential round-trip.
    prisma.warehouseDepartment.findMany({
      where: { companyId: user.companyId },
      include: {
        subcategories: { orderBy: [{ pinned: "desc" }, { order: "asc" }] },
      },
      orderBy: [{ pinned: "desc" }, { order: "asc" }],
    }),
  ]);

  const dataDepts = departments.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    icon: d.icon ?? "",
    pinned: d.pinned,
    subcategories: d.subcategories.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      pinned: s.pinned,
      items: s.items.map((it) => ({
        id: it.id,
        name: it.name,
        brand: it.brand ?? "",
        model: it.model ?? "",
        vendor: it.vendor ?? "",
        meta: it.notes ?? "",
        qty: it.unit ?? "",
        condition: it.condition ?? "",
        value: Number(it.value ?? 0),
        projectId: it.projectId,
        projectCode: it.project?.code ?? null,
      })),
    })),
  }));

  // KPI rollups
  let totalItems = 0;
  let totalValue = 0;
  let allocated = 0;
  let lowStock = 0;
  for (const d of dataDepts) {
    for (const s of d.subcategories) {
      for (const it of s.items) {
        totalItems++;
        totalValue += it.value;
        if (it.projectId) allocated++;
        const numericQty = parseFloat((it.qty.match(/[\d.,]+/) || ["0"])[0].replace(/,/g, ""));
        if (numericQty && numericQty < settings.warehouseLowStockThreshold) lowStock++;
      }
    }
  }
  const activeDepts = dataDepts.length;

  return (
    <WarehouseClient
      departments={dataDepts}
      allDeptsForManager={allDeptsForManager.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        pinned: d.pinned,
        hidden: d.hidden,
        subcategories: d.subcategories.map((s) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          pinned: s.pinned,
          hidden: s.hidden,
        })),
      }))}
      templates={templates.map((t) => ({
        id: t.id,
        name: t.name,
        scope: t.scope,
        isDefault: t.isDefault,
        isLocked: t.isLocked,
        data: (t.data ?? {}) as Record<string, unknown>,
      }))}
      kpi={{
        totalItems,
        totalValue,
        allocated,
        lowStock,
        activeDepts,
      }}
      canEdit={canEdit}
      canManage={canManage}
    />
  );
}
