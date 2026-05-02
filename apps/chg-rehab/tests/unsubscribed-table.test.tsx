import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/contacts/UnsubscribedRowActions", () => ({
  ReEnableEmailsButton: ({ contactId }: { contactId: string }) => (
    <button data-testid={`row-action-${contactId}`}>Re-enable</button>
  ),
}));

import {
  UnsubscribedTable,
  type UnsubscribedRow,
} from "@/app/contacts/UnsubscribedTable";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(id: string, name = `Contact ${id}`): UnsubscribedRow {
  return {
    id,
    name,
    company: null,
    typeLabel: "Contractor",
    email: `${id}@example.com`,
    emailOptOutAtLabel: "2 days ago",
    href: `/contacts/${id}`,
    linkTitle: name,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("UnsubscribedTable — selection and toolbar", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty-state message when there are no rows", () => {
    render(<UnsubscribedTable rows={[]} />);
    expect(
      screen.getByText("No contacts have unsubscribed from emails.")
    ).toBeInTheDocument();
  });

  it("renders each contact row with its name", () => {
    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob")];
    render(<UnsubscribedTable rows={rows} />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("shows 'Tick rows to re-enable emails in bulk' hint when nothing is selected", () => {
    render(<UnsubscribedTable rows={[makeRow("c-1")]} />);
    expect(
      screen.getByText("Tick rows to re-enable emails in bulk")
    ).toBeInTheDocument();
  });

  it("ticking a row checkbox shows the selection count and enables the Re-enable button", async () => {
    render(<UnsubscribedTable rows={[makeRow("c-1", "Alice"), makeRow("c-2", "Bob")]} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    expect(screen.getByText("1 selected")).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /re-enable emails \(1\)/i });
    expect(btn).toBeEnabled();
  });

  it("header checkbox selects all visible rows", async () => {
    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob"), makeRow("c-3", "Carol")];
    render(<UnsubscribedTable rows={rows} />);

    const headerCheckbox = screen.getByLabelText(
      "Select all unsubscribed contacts on this page"
    );

    await act(async () => {
      await userEvent.click(headerCheckbox);
    });

    expect(screen.getByText("3 selected")).toBeInTheDocument();
  });

  it("header checkbox shows indeterminate state when some (not all) rows are selected", async () => {
    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob")];
    render(<UnsubscribedTable rows={rows} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    const headerCheckbox = screen.getByLabelText(
      "Select all unsubscribed contacts on this page"
    ) as HTMLInputElement;

    // After selecting only one of two rows the header checkbox must be in the
    // indeterminate state (not checked, but not unchecked either).
    expect(headerCheckbox.indeterminate).toBe(true);
    expect(headerCheckbox.checked).toBe(false);
  });

  it("header checkbox deselects all rows when all are currently selected", async () => {
    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob")];
    render(<UnsubscribedTable rows={rows} />);

    const headerCheckbox = screen.getByLabelText(
      "Select all unsubscribed contacts on this page"
    );

    await act(async () => {
      await userEvent.click(headerCheckbox);
    });

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(headerCheckbox);
    });

    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Tick rows to re-enable emails in bulk")
    ).toBeInTheDocument();
  });

  it("'Clear' button resets the selection without calling fetch", async () => {
    render(<UnsubscribedTable rows={[makeRow("c-1", "Alice"), makeRow("c-2", "Bob")]} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    const clearBtn = screen.getByRole("button", { name: /clear/i });

    await act(async () => {
      await userEvent.click(clearBtn);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("the Re-enable button is not visible when no rows are selected", () => {
    render(<UnsubscribedTable rows={[makeRow("c-1")]} />);
    expect(
      screen.queryByRole("button", { name: /re-enable emails/i })
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // API interaction and status messages
  // -------------------------------------------------------------------------

  it("posts selected ids to the bulk endpoint and shows succeeded count", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, succeeded: 2, failed: 0, results: [] })
    );

    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob")];
    render(<UnsubscribedTable rows={rows} />);

    const headerCheckbox = screen.getByLabelText(
      "Select all unsubscribed contacts on this page"
    );

    await act(async () => {
      await userEvent.click(headerCheckbox);
    });

    const reEnableBtn = screen.getByRole("button", { name: /re-enable emails \(2\)/i });

    await act(async () => {
      await userEvent.click(reEnableBtn);
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/contacts/email-opt-out/bulk",
        expect.objectContaining({ method: "POST" })
      );
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { ids: string[] };
    expect(body.ids).toContain("c-1");
    expect(body.ids).toContain("c-2");

    await waitFor(() => {
      expect(screen.getByText("2 re-enabled")).toBeInTheDocument();
    });
  });

  it("surfaces both succeeded and failed counts in the toolbar on partial failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, succeeded: 1, failed: 1, results: [] })
    );

    const rows = [makeRow("c-1", "Alice"), makeRow("c-2", "Bob")];
    render(<UnsubscribedTable rows={rows} />);

    const headerCheckbox = screen.getByLabelText(
      "Select all unsubscribed contacts on this page"
    );

    await act(async () => {
      await userEvent.click(headerCheckbox);
    });

    const reEnableBtn = screen.getByRole("button", { name: /re-enable emails/i });

    await act(async () => {
      await userEvent.click(reEnableBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("1 re-enabled · 1 failed")).toBeInTheDocument();
    });
  });

  it("shows an error message in the toolbar when the request fails", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: "Admin only" }, 403)
    );

    render(<UnsubscribedTable rows={[makeRow("c-1", "Alice")]} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    const reEnableBtn = screen.getByRole("button", { name: /re-enable emails \(1\)/i });

    await act(async () => {
      await userEvent.click(reEnableBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/admin only/i)).toBeInTheDocument();
    });
  });

  it("clears the selection after a successful bulk re-enable", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, succeeded: 1, failed: 0, results: [] })
    );

    render(<UnsubscribedTable rows={[makeRow("c-1", "Alice")]} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    const reEnableBtn = screen.getByRole("button", { name: /re-enable emails \(1\)/i });

    await act(async () => {
      await userEvent.click(reEnableBtn);
    });

    await waitFor(() => {
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    });
  });

  it("does not call fetch when window.confirm returns false", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));

    render(<UnsubscribedTable rows={[makeRow("c-1", "Alice")]} />);

    const aliceCheckbox = screen.getByLabelText("Select Alice");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
    });

    const reEnableBtn = screen.getByRole("button", { name: /re-enable emails \(1\)/i });

    await act(async () => {
      await userEvent.click(reEnableBtn);
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
