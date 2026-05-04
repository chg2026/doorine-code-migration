import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/session";

// ---------------------------------------------------------------------------
// In-memory project store, hoisted so the vi.mock factory below can reach it.
// ---------------------------------------------------------------------------
const db = vi.hoisted(() => {
  return {
    projects: [] as Record<string, unknown>[],
    reset() {
      this.projects = [];
    },
  };
});

// ---------------------------------------------------------------------------
// Minimal prisma mock — only project.findMany is exercised by this route.
// ---------------------------------------------------------------------------
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findMany: async ({
        where,
        orderBy,
        select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: unknown;
        select?: Record<string, unknown>;
      }) => {
        let rows = db.projects.filter((p) => {
          if (!where) return true;
          for (const [k, v] of Object.entries(where)) {
            if (k === "status" && v && typeof v === "object" && "not" in (v as object)) {
              if (p[k] === (v as { not: unknown }).not) return false;
            } else if (p[k] !== v) {
              return false;
            }
          }
          return true;
        });

        // Apply minimal select projection
        if (select) {
          rows = rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(select)) {
              if (k === "property" && v && typeof v === "object") {
                const propSelect = (v as { select?: Record<string, boolean> }).select;
                const prop = row.property as Record<string, unknown> | null | undefined;
                out.property = prop
                  ? propSelect
                    ? Object.fromEntries(
                        Object.keys(propSelect).map((pk) => [pk, prop[pk]])
                      )
                    : prop
                  : null;
              } else if (v === true) {
                out[k] = row[k];
              }
            }
            return out;
          });
        }

        return rows;
      },
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { GET } from "./route";
import { getCurrentUser } from "@/lib/auth";

const mockGetCurrentUser = vi.mocked(getCurrentUser);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: overrides.id ?? "u-pm",
    companyId: overrides.companyId ?? "co-1",
    role: overrides.role ?? "ProjectManager",
    email: overrides.email ?? "pm@test",
    firstName: "Project",
    lastName: "Manager",
  };
}

let projectSeq = 0;
function seedProject(opts: {
  companyId: string;
  status: string;
  code?: string;
  name?: string;
  address?: string;
}): Record<string, unknown> {
  const id = `proj-${++projectSeq}`;
  const row: Record<string, unknown> = {
    id,
    code: opts.code ?? `P-${id}`,
    name: opts.name ?? `Project ${id}`,
    status: opts.status,
    companyId: opts.companyId,
    updatedAt: new Date(),
    property: opts.address ? { address: opts.address } : null,
  };
  db.projects.push(row);
  return row;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("GET /api/projects/list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.reset();
    projectSeq = 0;
  });

  it("returns 401 and does not query the DB when the caller is unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    // No projects were seeded, confirming the DB was never queried for data.
    expect(db.projects).toHaveLength(0);
  });

  it("returns only projects belonging to the caller's company", async () => {
    seedProject({ companyId: "co-1", status: "Active", code: "P-A1", name: "Alpha" });
    seedProject({ companyId: "co-2", status: "Active", code: "P-B1", name: "Beta" });
    seedProject({ companyId: "co-1", status: "Planning", code: "P-A2", name: "Gamma" });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    const codes = body.projects.map((p: { code: string }) => p.code);
    expect(codes).toContain("P-A1");
    expect(codes).toContain("P-A2");
    expect(codes).not.toContain("P-B1");
  });

  it("excludes projects whose status is Complete", async () => {
    seedProject({ companyId: "co-1", status: "Active", code: "P-ACT" });
    seedProject({ companyId: "co-1", status: "Complete", code: "P-DONE" });
    seedProject({ companyId: "co-1", status: "Planning", code: "P-PLAN" });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    const codes = body.projects.map((p: { code: string }) => p.code);
    expect(codes).toContain("P-ACT");
    expect(codes).toContain("P-PLAN");
    expect(codes).not.toContain("P-DONE");
  });

  it("returns the expected shape for each project (id, code, name, status, address)", async () => {
    seedProject({
      companyId: "co-1",
      status: "Active",
      code: "P-SHAPE",
      name: "Shape Test",
      address: "123 Main St",
    });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    const p = body.projects[0];
    expect(p).toMatchObject({
      code: "P-SHAPE",
      name: "Shape Test",
      status: "Active",
      address: "123 Main St",
    });
    expect(typeof p.id).toBe("string");
  });

  it("uses an empty string for address when the project has no property", async () => {
    seedProject({ companyId: "co-1", status: "Active", code: "P-NOPROP", address: undefined });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects[0].address).toBe("");
  });

  it("returns an empty list when the company has no non-Complete projects", async () => {
    seedProject({ companyId: "co-1", status: "Complete", code: "P-DONE-1" });
    seedProject({ companyId: "co-1", status: "Complete", code: "P-DONE-2" });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [] });
  });

  it("does not leak another company's projects even when both have non-Complete entries", async () => {
    for (let i = 0; i < 3; i++) {
      seedProject({ companyId: "co-other", status: "Active", code: `P-OTHER-${i}` });
    }
    seedProject({ companyId: "co-1", status: "Active", code: "P-MINE" });

    mockGetCurrentUser.mockResolvedValue(makeUser({ companyId: "co-1" }));

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].code).toBe("P-MINE");
  });
});
