import { prisma } from "./prisma";

const TTL_MS = 30_000;
type Cached = {
  ts: number;
  s: Awaited<ReturnType<typeof loadFresh>>;
};
const memo = new Map<string, Cached>();

async function loadFresh(companyId: string) {
  let s = await prisma.companySetting.findUnique({ where: { companyId } });
  if (!s) {
    s = await prisma.companySetting.create({ data: { companyId } });
  }
  return s;
}

export type CompanySettings = NonNullable<Awaited<ReturnType<typeof loadFresh>>>;

export async function getCompanySettings(companyId: string) {
  const cached = memo.get(companyId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.s;
  const s = await loadFresh(companyId);
  memo.set(companyId, { ts: Date.now(), s });
  return s;
}

export function invalidateCompanySettingsCache(companyId: string) {
  memo.delete(companyId);
}

export async function ensureCompanySettings(companyId: string) {
  return getCompanySettings(companyId);
}
