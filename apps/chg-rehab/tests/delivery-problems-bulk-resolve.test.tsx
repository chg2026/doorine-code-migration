import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  CardElement: () => null,
  useElements: () => null,
  useStripe: () => null,
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(async () => null),
}));

import { DeliveryProblems } from "@/app/admin/Client";

function makeFailure(
  id: string,
  name: string,
  overrides: Partial<{
    kind: "user" | "contact";
    recipientId: string | null;
    recipientEmail: string | null;
    event: string;
    title: string;
    reason: string;
    at: string;
    link: string | null;
  }> = {}
) {
  return {
    id,
    kind: "user" as const,
    recipientId: "uid-1",
    recipientName: name,
    recipientEmail: `${name.toLowerCase()}@example.com`,
    event: "project_update",
    title: "Project updated",
    reason: "invalid_recipient",
    at: new Date().toISOString(),
    link: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

const FAILURES = [
  makeFailure("u:1", "Alice"),
  makeFailure("u:2", "Bob"),
  makeFailure("u:3", "Carol"),
];

describe("DeliveryProblems — bulk resolve flow", () => {
  let postBodies: unknown[];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    postBodies = [];

    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method || "GET").toUpperCase();

      if (url === "/api/admin/notification-failures" && method === "GET") {
        return jsonResponse({ items: FAILURES });
      }
      if (url === "/api/admin/notification-failures" && method === "POST") {
        const body = JSON.parse(init?.body as string);
        postBodies.push(body);
        if (Array.isArray(body.ids)) {
          return jsonResponse({ resolved: body.ids.length });
        }
        return jsonResponse({ delivered: false, reason: "unknown", status: "Failed", at: new Date().toISOString() });
      }
      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ticking individual rows enables 'Resolve selected (N)' and posts the right ids", async () => {
    render(<DeliveryProblems isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Select delivery problem for Alice")).toBeInTheDocument();
    });

    const aliceCheckbox = screen.getByLabelText("Select delivery problem for Alice");
    const bobCheckbox = screen.getByLabelText("Select delivery problem for Bob");

    await act(async () => {
      await userEvent.click(aliceCheckbox);
      await userEvent.click(bobCheckbox);
    });

    const resolveBtn = screen.getByRole("button", { name: /resolve selected \(2\)/i });
    expect(resolveBtn).toBeEnabled();

    await act(async () => {
      await userEvent.click(resolveBtn);
    });

    await waitFor(() => {
      const postCalls = postBodies.filter((b: unknown) => {
        const body = b as { ids?: unknown };
        return Array.isArray(body.ids);
      });
      expect(postCalls.length).toBeGreaterThan(0);
      const lastPost = postCalls[postCalls.length - 1] as { ids: string[] };
      expect(lastPost.ids).toContain("u:1");
      expect(lastPost.ids).toContain("u:2");
      expect(lastPost.ids).not.toContain("u:3");
    });
  });

  it("header checkbox selects all rows; clicking again clears the selection", async () => {
    render(<DeliveryProblems isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Select all delivery problems shown")).toBeInTheDocument();
    });

    const selectAll = screen.getByLabelText("Select all delivery problems shown");

    await act(async () => {
      await userEvent.click(selectAll);
    });

    await waitFor(() => {
      expect(screen.getByText("3 selected")).toBeInTheDocument();
    });

    await act(async () => {
      await userEvent.click(selectAll);
    });

    await waitFor(() => {
      expect(screen.getByText(/select all \(3\)/i)).toBeInTheDocument();
    });
  });

  it("'Clear all' is gated by window.confirm and resolves every visible row", async () => {
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmMock);

    render(<DeliveryProblems isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear all/i })).toBeInTheDocument();
    });

    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });

    await act(async () => {
      await userEvent.click(clearAllBtn);
    });

    expect(confirmMock).toHaveBeenCalledOnce();
    const noPosts = postBodies.filter((b: unknown) => {
      const body = b as { ids?: unknown };
      return Array.isArray(body.ids);
    });
    expect(noPosts).toHaveLength(0);

    confirmMock.mockReturnValue(true);

    await act(async () => {
      await userEvent.click(clearAllBtn);
    });

    await waitFor(() => {
      const postCalls = postBodies.filter((b: unknown) => {
        const body = b as { ids?: unknown };
        return Array.isArray(body.ids);
      });
      expect(postCalls.length).toBeGreaterThan(0);
      const lastPost = postCalls[postCalls.length - 1] as { ids: string[] };
      expect(lastPost.ids).toEqual(expect.arrayContaining(["u:1", "u:2", "u:3"]));
      expect(lastPost.ids).toHaveLength(3);
    });
  });

  it("badge count drops to zero immediately after a successful bulk action", async () => {
    render(<DeliveryProblems isAdmin={true} />);

    await waitFor(() => {
      expect(screen.getByLabelText("Select all delivery problems shown")).toBeInTheDocument();
    });

    const badge = screen.getByText("3");
    expect(badge).toBeInTheDocument();

    const selectAll = screen.getByLabelText("Select all delivery problems shown");
    await act(async () => {
      await userEvent.click(selectAll);
    });

    const resolveBtn = screen.getByRole("button", { name: /resolve selected \(3\)/i });
    await act(async () => {
      await userEvent.click(resolveBtn);
    });

    await waitFor(() => {
      expect(screen.queryByText("3")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(
        screen.queryByText("No recent delivery problems. Outbound notifications are reaching their recipients.")
      ).toBeInTheDocument();
    });
  });
});
