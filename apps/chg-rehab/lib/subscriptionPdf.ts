/**
 * Generate a single-page PDF receipt for a portal-originated subscription.
 * Pure pdf-lib — no fonts to ship, no external services. Returned buffer
 * can be written via `putPrivateObject({ subdir: "receipts", ext: ".pdf" })`.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface SubscriptionReceiptInput {
  offeringName: string;
  investorName: string;
  investorEmail: string | null;
  committedAmount: number;
  commitmentType: "Soft" | "Hard";
  signedName: string;
  signedAt: Date;
  receiptId: string;
}

const fmtUSD = (n: number) =>
  `$${Math.round(n).toLocaleString("en-US")}`;

export async function buildSubscriptionReceiptPdf(
  i: SubscriptionReceiptInput
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const teal = rgb(0.114, 0.62, 0.459);
  const muted = rgb(0.45, 0.45, 0.45);
  const ink = rgb(0.12, 0.12, 0.12);

  // Header bar
  page.drawRectangle({ x: 0, y: 752, width: 612, height: 40, color: teal });
  page.drawText("Subscription receipt", {
    x: 40, y: 766, size: 16, font: bold, color: rgb(1, 1, 1),
  });

  // Branding / title
  page.drawText("Vestry Capital — Investor Portal", {
    x: 40, y: 720, size: 11, font, color: muted,
  });

  // Receipt id + date
  page.drawText(`Receipt: ${i.receiptId}`, {
    x: 40, y: 700, size: 10, font, color: muted,
  });
  page.drawText(
    `Issued: ${i.signedAt.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}`,
    { x: 40, y: 686, size: 10, font, color: muted }
  );

  // Body — labelled grid
  let y = 640;
  const drawRow = (label: string, value: string, opts: { highlight?: boolean } = {}) => {
    page.drawText(label, { x: 40, y, size: 10, font, color: muted });
    page.drawText(value, {
      x: 200, y, size: opts.highlight ? 14 : 11,
      font: opts.highlight ? bold : font,
      color: opts.highlight ? teal : ink,
    });
    y -= opts.highlight ? 26 : 22;
  };

  drawRow("Investor", i.investorName);
  if (i.investorEmail) drawRow("Email", i.investorEmail);
  drawRow("Offering", i.offeringName);
  drawRow("Commitment type", i.commitmentType === "Hard" ? "Hard commitment" : "Soft commitment");
  drawRow("Committed amount", fmtUSD(i.committedAmount), { highlight: true });
  drawRow("Signed by (typed)", i.signedName);

  // Disclaimer
  y -= 10;
  page.drawRectangle({ x: 36, y: y - 90, width: 540, height: 86, color: rgb(0.97, 0.97, 0.94), borderColor: rgb(0.85, 0.85, 0.8), borderWidth: 0.5 });
  page.drawText("E-sign acknowledgement (placeholder)", {
    x: 48, y: y - 16, size: 10, font: bold, color: ink,
  });
  const lines = [
    "This receipt confirms the investor's intent-to-commit submitted via the Vestry investor",
    "portal. The typed-name acknowledgement above is a non-binding placeholder until the",
    "operator countersigns the formal subscription agreement and confirms funded capital.",
    "Wire / ACH instructions will be delivered separately by the operator.",
  ];
  let ly = y - 32;
  for (const line of lines) {
    page.drawText(line, { x: 48, y: ly, size: 9, font, color: muted });
    ly -= 13;
  }

  // Footer
  page.drawText("Vestry Capital · investor-portal", {
    x: 40, y: 40, size: 9, font, color: muted,
  });
  page.drawText("Generated automatically — keep for your records.", {
    x: 320, y: 40, size: 9, font, color: muted,
  });

  return pdf.save();
}
