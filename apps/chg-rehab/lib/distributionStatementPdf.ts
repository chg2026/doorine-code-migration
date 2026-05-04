/**
 * Generate a one-page PDF distribution statement for a single investor's
 * allocation. Mirrors the visual style of `subscriptionPdf` so the
 * investor's vault feels coherent.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface DistributionStatementInput {
  offeringName: string;
  investorName: string;
  investorEmail: string | null;
  periodLabel: string;
  distributionType: string;
  totalAmount: number;
  allocationAmount: number;
  perDollarRate: number | null;
  paidOn: Date | null;
  wireRef: string | null;
  statementId: string;
}

const fmtUSD = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export async function buildDistributionStatementPdf(
  i: DistributionStatementInput
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.114, 0.62, 0.459);
  const muted = rgb(0.45, 0.45, 0.45);
  const ink = rgb(0.12, 0.12, 0.12);

  page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: teal });
  page.drawText("Distribution statement", {
    x: 40, y: 766, size: 16, font: bold, color: rgb(1, 1, 1),
  });

  page.drawText("Vestry Capital — Investor Portal", {
    x: 40, y: 720, size: 11, font, color: muted,
  });
  page.drawText(`Statement: ${i.statementId}`, {
    x: 40, y: 700, size: 10, font, color: muted,
  });
  page.drawText(
    `Issued: ${new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
    { x: 40, y: 686, size: 10, font, color: muted }
  );

  let y = 640;
  const drawRow = (label: string, value: string, opts: { highlight?: boolean } = {}) => {
    page.drawText(label, { x: 40, y, size: 10, font, color: muted });
    page.drawText(value, {
      x: 220, y, size: opts.highlight ? 14 : 11,
      font: opts.highlight ? bold : font,
      color: opts.highlight ? teal : ink,
    });
    y -= opts.highlight ? 26 : 22;
  };

  drawRow("Investor", i.investorName);
  if (i.investorEmail) drawRow("Email", i.investorEmail);
  drawRow("Offering", i.offeringName);
  drawRow("Period", i.periodLabel);
  drawRow("Distribution type", i.distributionType);
  drawRow("Total distribution", fmtUSD(i.totalAmount));
  drawRow("Your allocation", fmtUSD(i.allocationAmount), { highlight: true });
  if (i.perDollarRate !== null)
    drawRow("Per-dollar rate", `$${i.perDollarRate.toFixed(6)} / committed $`);
  drawRow("Paid on", i.paidOn ? i.paidOn.toLocaleDateString("en-US", { dateStyle: "long" }) : "—");
  if (i.wireRef) drawRow("Wire reference", i.wireRef);

  y -= 10;
  page.drawRectangle({ x: 36, y: y - 60, width: 540, height: 56, color: rgb(0.97, 0.97, 0.94), borderColor: rgb(0.85, 0.85, 0.8), borderWidth: 0.5 });
  const lines = [
    "This statement summarises the distribution allocation paid to you for the",
    "period above. Keep a copy for your records; figures are also reflected on",
    "your Distributions page in the investor portal.",
  ];
  let ly = y - 16;
  for (const line of lines) {
    page.drawText(line, { x: 48, y: ly, size: 9, font, color: muted });
    ly -= 13;
  }

  page.drawText("Vestry Capital · investor-portal", {
    x: 40, y: 40, size: 9, font, color: muted,
  });
  page.drawText("Generated automatically — keep for your records.", {
    x: 320, y: 40, size: 9, font, color: muted,
  });
  return pdf.save();
}
