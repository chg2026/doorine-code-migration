export function fmtC(n: number | { toString(): string } | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "number" ? n : Number(n.toString());
  if (Number.isNaN(v)) return "—";
  return "$" + Math.round(v).toLocaleString();
}

export function fmtCDec(n: number | { toString(): string } | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = typeof n === "number" ? n : Number(n.toString());
  if (Number.isNaN(v)) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
