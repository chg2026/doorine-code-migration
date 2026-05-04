import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentInvestor } from "@/lib/auth";
import { getPrivateFile, ObjectNotFoundError } from "@/lib/objectStorage";
import { InvestorDocType } from "@prisma/client";
import archiver from "archiver";

export const dynamic = "force-dynamic";

/**
 * Stream a ZIP of the investor's K-1s for an optional `?year=YYYY` filter.
 * Files are pulled directly from object storage and piped through archiver
 * so we never buffer the full zip in memory.
 */
export async function GET(req: NextRequest) {
  const me = await getCurrentInvestor();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const yearStr = url.searchParams.get("year");
  const year = yearStr ? Number(yearStr) : null;
  if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2100))
    return NextResponse.json({ error: "invalid year" }, { status: 400 });

  const docs = await prisma.investorDocument.findMany({
    where: {
      investorId: me.id,
      docType: InvestorDocType.TaxK1,
      ...(year !== null ? { taxYear: year } : {}),
      objectPath: { not: null },
    },
    include: { offering: { select: { name: true } } },
    orderBy: [{ taxYear: "desc" }, { uploadedAt: "desc" }],
  });

  if (docs.length === 0)
    return NextResponse.json({ error: "no_documents" }, { status: 404 });

  const archive = archiver("zip", { zlib: { level: 5 } });
  const stream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      archive.on("end", () => controller.close());
      archive.on("warning", (err) => console.warn("[tax-zip] warning", err));
      archive.on("error", (err) => controller.error(err));

      (async () => {
        const used = new Set<string>();
        for (const d of docs) {
          try {
            const file = await getPrivateFile(d.objectPath!);
            const baseName =
              d.name && d.name.endsWith(".pdf")
                ? d.name
                : `${d.name || "K-1"}.pdf`;
            const folder = d.taxYear ? `${d.taxYear}` : "K-1s";
            let entryName = `${folder}/${baseName}`;
            // Avoid duplicate names within zip.
            let n = 2;
            while (used.has(entryName)) {
              const dot = baseName.lastIndexOf(".");
              const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
              const ext = dot > 0 ? baseName.slice(dot) : "";
              entryName = `${folder}/${stem} (${n})${ext}`;
              n++;
            }
            used.add(entryName);
            archive.append(file.createReadStream(), { name: entryName });
          } catch (err) {
            if (err instanceof ObjectNotFoundError) continue;
            console.error("[tax-zip] file failed", d.id, err);
          }
        }
        await archive.finalize();
      })().catch((err) => controller.error(err));
    },
    cancel() {
      archive.destroy();
    },
  });

  const filename = year ? `K-1s-${year}.zip` : `K-1s.zip`;
  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=0, no-store",
    },
  });
}
