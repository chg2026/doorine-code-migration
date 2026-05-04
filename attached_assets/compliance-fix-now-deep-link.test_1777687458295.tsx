import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---------------------------------------------------------------------------
// Static mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/billing-blocked-client", () => ({
  billingAwareErrorMessage: (
    _status: number,
    body: { error?: string },
    fallback: string
  ) => body?.error ?? fallback,
}));

vi.mock("@/lib/useBillingHealth", () => ({
  useBillingGateProps: () => ({
    disabled: false,
    style: undefined,
    title: undefined,
  }),
}));

vi.mock("@/lib/contacts/actions", () => ({
  uploadContractorComplianceDoc: vi.fn(async () => undefined),
  renewContractorComplianceDoc: vi.fn(async () => undefined),
}));

vi.mock("@/lib/fileValidation", () => ({
  ALLOWED_UPLOAD_MIME_TYPES: new Set(["application/pdf", "image/jpeg", "image/png"]),
  ALLOWED_UPLOAD_TYPES_LABEL: "PDF, JPG, PNG",
  MAX_UPLOAD_SIZE_BYTES: 10 * 1024 * 1024,
  MAX_UPLOAD_SIZE_LABEL: "10 MB",
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const ONE_PROJECT = [
  { id: "proj-1", code: "P-1", name: "Project One", status: "Active", address: "1 Main St" },
];

const DEFAULT_ASSIGN_STATE = {
  allowed: true,
  reasons: [],
  blockingEnabled: false,
};

// ---------------------------------------------------------------------------
// ContractorComplianceModal — "Fix now" links in the assignment notice toast
// ---------------------------------------------------------------------------

import { ContractorComplianceModal } from "@/app/contacts/ComplianceModal";

describe("ContractorComplianceModal — 'Fix now' deep-links in assignment notice", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  async function driveAssignment(warnings: unknown[]) {
    fetchMock
      .mockResolvedValueOnce(jsonOk({ projects: ONE_PROJECT }))
      .mockResolvedValueOnce(jsonOk({ ok: true, warnings }));

    render(
      <ContractorComplianceModal
        contactId="contact-42"
        contactName="Jane Doe"
        companyId="co-1"
        assignState={DEFAULT_ASSIGN_STATE}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));
    const option = await screen.findByRole("option", { name: /P-1/i });
    await userEvent.click(option);
    await userEvent.click(screen.getByRole("button", { name: /confirm assignment/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/contact-42/assign",
        expect.objectContaining({ method: "POST" })
      )
    );
  }

  it("renders a 'Fix now' link with href /contacts/<id>#compliance-w9 for a w9 warning", async () => {
    await driveAssignment([{ message: "W-9 missing", requirement: "w9" }]);

    const link = await screen.findByRole("link", { name: /fix now/i });
    expect(link).toHaveAttribute("href", "/contacts/contact-42#compliance-w9");
  });

  it("renders a 'Fix now' link with href /contacts/<id>#compliance-coi for a coi warning", async () => {
    await driveAssignment([{ message: "COI expired", requirement: "coi" }]);

    const link = await screen.findByRole("link", { name: /fix now/i });
    expect(link).toHaveAttribute("href", "/contacts/contact-42#compliance-coi");
  });

  it("renders a 'Fix now' link with href /contacts/<id>#compliance-license for a license warning", async () => {
    await driveAssignment([{ message: "Trade license missing", requirement: "license" }]);

    const link = await screen.findByRole("link", { name: /fix now/i });
    expect(link).toHaveAttribute("href", "/contacts/contact-42#compliance-license");
  });

  it("renders a 'Fix now' link for each of multiple requirement warnings", async () => {
    await driveAssignment([
      { message: "W-9 missing", requirement: "w9" },
      { message: "COI expired", requirement: "coi" },
      { message: "Trade license missing", requirement: "license" },
    ]);

    const links = await screen.findAllByRole("link", { name: /fix now/i });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/contacts/contact-42#compliance-w9");
    expect(links[1]).toHaveAttribute("href", "/contacts/contact-42#compliance-coi");
    expect(links[2]).toHaveAttribute("href", "/contacts/contact-42#compliance-license");
  });

  it("does NOT render a 'Fix now' link for a legacy plain-string warning", async () => {
    await driveAssignment(["W-9 missing (legacy)"]);

    await screen.findByRole("status");
    expect(screen.getByText("W-9 missing (legacy)")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /fix now/i })).not.toBeInTheDocument();
  });

  it("does NOT render a 'Fix now' link for object warnings with an unrecognised requirement key", async () => {
    await driveAssignment([{ message: "Unknown issue", requirement: "unknown-type" }]);

    await screen.findByRole("status");
    expect(screen.getByText("Unknown issue")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /fix now/i })).not.toBeInTheDocument();
  });

  it("clicking 'Fix now' dismisses the toast (calls onDone)", async () => {
    await driveAssignment([{ message: "W-9 missing", requirement: "w9" }]);

    const link = await screen.findByRole("link", { name: /fix now/i });
    await userEvent.click(link);

    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  });
});

// ---------------------------------------------------------------------------
// AddComplianceDocButton — hash-based auto-open
// ---------------------------------------------------------------------------

import { AddComplianceDocButton } from "@/app/contacts/[id]/ComplianceDocManager";

describe("AddComplianceDocButton — hash deep-link auto-opens upload modal", () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    window.location.hash = "";
  });

  it("opens the upload modal with W-9 pre-selected when hash is #compliance-w9", async () => {
    window.location.hash = "#compliance-w9";

    render(<AddComplianceDocButton contactId="contact-42" />);

    const select = await screen.findByRole("combobox");
    expect(select).toBeInTheDocument();
    expect((select as HTMLSelectElement).value).toBe("w9");
  });

  it("focuses the document-type select when opened via #compliance-w9 hash", async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    window.location.hash = "#compliance-w9";

    render(<AddComplianceDocButton contactId="contact-42" />);

    const select = await screen.findByRole("combobox");
    await waitFor(() => {
      const focusCalls = focusSpy.mock.instances;
      expect(focusCalls.some((el) => el === select)).toBe(true);
    });

    focusSpy.mockRestore();
  });

  it("opens the upload modal with COI (insurance) pre-selected when hash is #compliance-coi", async () => {
    window.location.hash = "#compliance-coi";

    render(<AddComplianceDocButton contactId="contact-42" />);

    const select = await screen.findByRole("combobox");
    expect((select as HTMLSelectElement).value).toBe("insurance");
  });

  it("opens the upload modal with license pre-selected when hash is #compliance-license", async () => {
    window.location.hash = "#compliance-license";

    render(<AddComplianceDocButton contactId="contact-42" />);

    const select = await screen.findByRole("combobox");
    expect((select as HTMLSelectElement).value).toBe("license");
  });

  it("does NOT auto-open the modal when there is no compliance hash", async () => {
    window.location.hash = "";

    render(<AddComplianceDocButton contactId="contact-42" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload compliance document/i })).toBeInTheDocument();
  });

  it("does NOT auto-open the modal when the hash is unrelated", async () => {
    window.location.hash = "#some-other-section";

    render(<AddComplianceDocButton contactId="contact-42" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("scrolls the upload button into view when opened via hash", async () => {
    window.location.hash = "#compliance-w9";

    render(<AddComplianceDocButton contactId="contact-42" />);

    await screen.findByRole("combobox");
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
  });
});
