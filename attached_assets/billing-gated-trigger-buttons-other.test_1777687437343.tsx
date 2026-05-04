import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({ get: (_k: string) => null }),
}));

class MockEventSource {
  url: string;
  onmessage: ((evt: MessageEvent) => void) | null = null;
  onerror: ((evt: Event) => void) | null = null;
  onopen: ((evt: Event) => void) | null = null;
  readyState = 1;
  constructor(url: string) {
    this.url = url;
  }
  close() {}
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() {
    return true;
  }
}

type Role = "Admin" | "Member";
type FetchState = { paymentIssue: boolean; role: Role };

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function installFetchMock(state: FetchState) {
  const counts = { status: 0, role: 0 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url === "/api/billing/status") {
      counts.status += 1;
      return jsonResponse({ paymentIssue: state.paymentIssue });
    }
    if (url === "/api/auth/user") {
      counts.role += 1;
      return jsonResponse({ user: { role: state.role } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, counts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function waitForBillingFetches(
  RTL: typeof import("@testing-library/react"),
  counts: { status: number; role: number }
) {
  await RTL.waitFor(() => {
    expect(counts.status).toBeGreaterThanOrEqual(1);
    expect(counts.role).toBeGreaterThanOrEqual(1);
  });
}

// ─── AddPropertyButton ────────────────────────────────────────────────────────

describe("billing-gated trigger buttons (AddPropertyButton)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const { AddPropertyButton } = await import("@/app/property/PropertyActions");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(AddPropertyButton));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add property/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add property/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── StartRehabButton ─────────────────────────────────────────────────────────

describe("billing-gated trigger buttons (StartRehabButton)", () => {
  const seed = {
    propertyId: "prop-1",
    address: "123 Main St",
    purchasePrice: null,
    acquisitionDate: null,
    defaultMode: null,
    defaultBudget: null,
  };

  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const { StartRehabButton } = await import("@/app/property/PropertyActions");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(StartRehabButton, { seed }));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /start rehab project/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /start rehab project/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── AddAssetButton ───────────────────────────────────────────────────────────

describe("billing-gated trigger buttons (AddAssetButton)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const { AddAssetButton } = await import("@/app/property/PropertyActions");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(AddAssetButton, { propertyId: "prop-1" }));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add asset/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add asset/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── UploadDocButton (property-level) ────────────────────────────────────────

describe("billing-gated trigger buttons (UploadDocButton from PropertyActions)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const { UploadDocButton } = await import("@/app/property/PropertyActions");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(UploadDocButton, { propertyId: "prop-1" }));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ upload document/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ upload document/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── DocsClient (documents hub upload button) ─────────────────────────────────

const minDocsClientProps = {
  docs: [],
  thresholdDays: 30,
  projects: [],
  properties: [],
  contacts: [],
  canEdit: true,
  filters: {
    level: "Project" as const,
    status: "all-status" as const,
    cat: "cat-all",
    q: "",
  },
  counts: {
    levelCounts: { Project: 0, Property: 0, Company: 0, Contact: 0 },
    statusCounts: {},
    catCounts: {},
  },
};

describe("billing-gated trigger buttons (DocsClient — Upload document)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const DocsClient = (await import("@/app/docs/Client")).default;
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(DocsClient, minDocsClientProps));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders the upload button disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const buttons = utils.getAllByRole("button", { name: /upload document/i });
    const uploadBtn = buttons[0];
    await RTL.waitFor(() => {
      expect(uploadBtn).toBeDisabled();
    });
    expect(uploadBtn).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(uploadBtn).toHaveAttribute("aria-disabled", "true");
    expect(uploadBtn.style.cursor).toBe("not-allowed");
  });

  it("upload button stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const buttons = utils.getAllByRole("button", { name: /upload document/i });
    const uploadBtn = buttons[0];
    expect(uploadBtn).toBeEnabled();
    expect(uploadBtn).not.toHaveAttribute("aria-disabled");
  });
});

// ─── WarehouseClient (add item button) ───────────────────────────────────────

const minWarehouseClientProps = {
  departments: [
    {
      id: "dept-1",
      code: "tools",
      name: "Tools",
      icon: "🔧",
      pinned: false,
      subcategories: [
        { id: "sub-1", code: "hand-tools", name: "Hand tools", pinned: false, items: [] },
      ],
    },
  ],
  allDeptsForManager: [],
  templates: [],
  kpi: {
    totalItems: 0,
    totalValue: 0,
    allocated: 0,
    lowStock: 0,
    activeDepts: 1,
  },
  canEdit: true,
  canManage: false,
};

describe("billing-gated trigger buttons (WarehouseClient — Add item)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const WarehouseClient = (await import("@/app/warehouse/Client")).default;
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(
      React.createElement(WarehouseClient, minWarehouseClientProps)
    );
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders the add-item button disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add item/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("add-item button stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ add item/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── ContractorComplianceModal (assign-to-project button) ────────────────────

const minComplianceModalProps = {
  contactId: "contact-1",
  contactName: "Jane Contractor",
  companyId: "company-1",
  assignState: { allowed: true, reasons: [], blockingEnabled: false },
};

describe("billing-gated trigger buttons (ContractorComplianceModal — Assign to project)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);
    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const { ContractorComplianceModal } = await import("@/app/contacts/ComplianceModal");
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(
      React.createElement(ContractorComplianceModal, minComplianceModalProps)
    );
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders the assign button disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /assign to project/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("assign button stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /assign to project/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});

// ─── AdminClient (Invite user button) ────────────────────────────────────────

const minAdminClientProps = {
  currentUserRole: "Admin",
  currentUserId: "user-admin",
  companyName: "Test Co",
  settings: {
    strictPaymentGate: false,
    blockAssignmentIfDocsMissing: false,
    expiryAlertThresholdDays: 30,
    projectIdPrefix: "PRJ",
    defaultProjectMode: "rehab",
    timezone: "UTC",
    dateFormat: "MM/DD/YYYY",
    warehouseLowStockThreshold: 5,
    contractorPortalEnabled: false,
    meta: {},
  },
  perms: [],
  users: [],
  invites: [],
  unsubscribeLinkDiagnostic: {
    ok: true,
    origin: null,
    source: null,
    sampleUrl: null,
    reason: null,
  },
  staleAlertThresholdMs: 0,
  staleAlertThrottleMs: 0,
};

describe("billing-gated trigger buttons (AdminClient — Invite user)", () => {
  async function freshRender(state: FetchState) {
    vi.resetModules();
    vi.stubGlobal("EventSource", MockEventSource as unknown as typeof EventSource);
    const { counts } = installFetchMock(state);

    vi.doMock("next/navigation", () => ({
      useRouter: () => ({
        refresh: vi.fn(),
        push: vi.fn(),
        replace: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
      }),
      useSearchParams: () => ({ get: (k: string) => (k === "panel" ? "users" : null) }),
    }));

    vi.doMock("@/app/admin/BillingPanel", () => ({
      default: () => null,
    }));

    const React = (await import("react")).default;
    const RTL = await import("@testing-library/react");
    const AdminClient = (await import("@/app/admin/Client")).default;
    const { BILLING_GATE_DISABLED_TOOLTIP } = await import("@/lib/useBillingHealth");
    const utils = RTL.render(React.createElement(AdminClient, minAdminClientProps));
    return { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP };
  }

  it("renders the invite button disabled with the billing tooltip when paymentIssue=true and the user is non-admin", async () => {
    const { counts, RTL, utils, BILLING_GATE_DISABLED_TOOLTIP } = await freshRender({
      paymentIssue: true,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ invite user/i });
    await RTL.waitFor(() => {
      expect(button).toBeDisabled();
    });
    expect(button).toHaveAttribute("title", BILLING_GATE_DISABLED_TOOLTIP);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button.style.cursor).toBe("not-allowed");
  });

  it("invite button stays enabled when billing is healthy", async () => {
    const { counts, RTL, utils } = await freshRender({
      paymentIssue: false,
      role: "Member",
    });

    await waitForBillingFetches(RTL, counts);

    const button = utils.getByRole("button", { name: /\+ invite user/i });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});
