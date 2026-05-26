import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { companyId: user.companyId, active: true },
    select: { id: true, firstName: true, lastName: true, email: true, initials: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "User",
      initials: (u.initials ||
        [(u.firstName ?? "")[0], (u.lastName ?? "")[0]].filter(Boolean).join("") ||
        (u.email ?? "?")[0]).toUpperCase(),
      email: u.email,
    })),
  });
}
