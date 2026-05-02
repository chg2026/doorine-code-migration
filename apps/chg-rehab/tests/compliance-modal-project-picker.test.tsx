import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---------------------------------------------------------------------------
// Static mocks that don't vary between tests
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

// ---------------------------------------------------------------------------
// Re-usable helpers
// ---------------------------------------------------------------------------
function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeProjects(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `proj-${i + 1}`,
    code: `P-${i + 1}`,
    name: `Project ${i + 1}`,
    status: "Active",
    address: `${(i + 1) * 100} Main St`,
  }));
}

const defaultAssignState = {
  allowed: true,
  reasons: [],
  blockingEnabled: false,
};

import { ContractorComplianceModal } from "@/app/contacts/ComplianceModal";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("ContractorComplianceModal — project picker", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("renders the Assign button and does not fetch until the modal is opened", () => {
    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    expect(screen.getByRole("button", { name: /assign to project/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches /api/projects/list when the modal opens and shows the project list", async () => {
    const projects = makeProjects(3);
    fetchMock.mockResolvedValue(jsonOk({ projects }));

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));

    // Modal heading
    await waitFor(() =>
      expect(screen.getByText(/assign Alice to a project/i)).toBeInTheDocument()
    );

    // All project codes appear
    for (const p of projects) {
      expect(await screen.findByText(p.code)).toBeInTheDocument();
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/list",
      expect.objectContaining({ headers: expect.objectContaining({ accept: "application/json" }) })
    );
  });

  it("filters the list as the user types in the search box", async () => {
    const projects = [
      { id: "p1", code: "ALPHA-01", name: "Alpha Project", status: "Active", address: "1 Alpha Rd" },
      { id: "p2", code: "BETA-02", name: "Beta Project", status: "Active", address: "2 Beta Ave" },
      { id: "p3", code: "GAMMA-03", name: "Gamma Project", status: "Planning", address: "3 Gamma Blvd" },
    ];
    fetchMock.mockResolvedValue(jsonOk({ projects }));

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));

    // Wait for the list to load
    await screen.findByText("ALPHA-01");

    const searchInput = screen.getByPlaceholderText(/search by code/i);
    await userEvent.type(searchInput, "BETA");

    expect(screen.queryByText("ALPHA-01")).not.toBeInTheDocument();
    expect(screen.getByText("BETA-02")).toBeInTheDocument();
    expect(screen.queryByText("GAMMA-03")).not.toBeInTheDocument();
  });

  it("selecting a project and confirming POSTs to the assign endpoint with projectId in the body", async () => {
    const projects = makeProjects(2);
    fetchMock
      .mockResolvedValueOnce(jsonOk({ projects }))           // /api/projects/list
      .mockResolvedValueOnce(jsonOk({ ok: true, warnings: [] })); // /api/contacts/:id/assign

    render(
      <ContractorComplianceModal
        contactId="c-42"
        contactName="Bob"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));

    // Pick the first project
    const firstOption = await screen.findByRole("option", { name: /P-1/i });
    await userEvent.click(firstOption);

    // Confirm assignment
    const confirmBtn = screen.getByRole("button", { name: /confirm assignment/i });
    await userEvent.click(confirmBtn);

    // Wait for the assign call
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [assignUrl, assignInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(assignUrl).toBe("/api/contacts/c-42/assign");
    expect(assignInit.method).toBe("POST");

    const sentBody = JSON.parse(assignInit.body as string);
    expect(sentBody).toEqual({ projectId: "proj-1" });
  });

  it("shows an error message and Retry button when /api/projects/list fails", async () => {
    // Return a non-ok response with no JSON body so the component falls back
    // to the generic "Failed to load projects (<status>)" message.
    fetchMock.mockResolvedValue(
      new Response("", { status: 503, headers: { "content-type": "text/plain" } })
    );

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));

    await screen.findByText(/failed to load projects/i);
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows 'no active projects' when the list comes back empty", async () => {
    fetchMock.mockResolvedValue(jsonOk({ projects: [] }));

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));

    await screen.findByText(/no active projects found/i);
  });

  it("Confirm assignment button is disabled until a project is selected", async () => {
    const projects = makeProjects(1);
    fetchMock.mockResolvedValue(jsonOk({ projects }));

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));
    await screen.findByText("P-1");

    const confirmBtn = screen.getByRole("button", { name: /confirm assignment/i });
    expect(confirmBtn).toBeDisabled();

    // Select the project — button should become enabled
    await userEvent.click(screen.getByRole("option", { name: /P-1/i }));
    expect(confirmBtn).not.toBeDisabled();
  });

  it("shows a 'no projects match' message when the search has no results", async () => {
    const projects = makeProjects(2);
    fetchMock.mockResolvedValue(jsonOk({ projects }));

    render(
      <ContractorComplianceModal
        contactId="c-1"
        contactName="Alice"
        companyId="co-1"
        assignState={defaultAssignState}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /assign to project/i }));
    await screen.findByText("P-1");

    const searchInput = screen.getByPlaceholderText(/search by code/i);
    await userEvent.type(searchInput, "ZZZNOMATCH");

    expect(screen.getByText(/no projects match/i)).toBeInTheDocument();
  });
});
