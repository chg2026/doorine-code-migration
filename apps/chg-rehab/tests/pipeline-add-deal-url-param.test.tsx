import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ---------------------------------------------------------------------------
// Mutable search-param state — adjusted per test
// ---------------------------------------------------------------------------

let mockParamGet: (key: string) => string | null = () => null;
let mockParamsToString: () => string = () => "";
const mockReplace = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => mockParamGet(key),
    toString: () => mockParamsToString(),
  }),
  usePathname: () => "/pipeline",
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
// Imports (after mocks)
// ---------------------------------------------------------------------------

import AddDealButton from "@/app/pipeline/AddDealButton";
import AddDealLink from "@/app/pipeline/AddDealLink";

// ---------------------------------------------------------------------------
// AddDealButton — URL param ?new=1 opens the modal
// ---------------------------------------------------------------------------

describe("AddDealButton — ?new=1 URL param", () => {
  beforeEach(() => {
    mockParamGet = () => null;
    mockParamsToString = () => "";
    mockReplace.mockReset();
    mockPush.mockReset();
  });

  it("opens the modal when ?new=1 is present in the URL", async () => {
    mockParamGet = (key) => (key === "new" ? "1" : null);
    mockParamsToString = () => "new=1";

    render(<AddDealButton />);

    await waitFor(() =>
      expect(screen.getByText("Add new deal")).toBeInTheDocument()
    );
  });

  it("removes the 'new' param from the URL after opening the modal", async () => {
    mockParamGet = (key) => (key === "new" ? "1" : null);
    mockParamsToString = () => "new=1";

    render(<AddDealButton />);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));

    const [calledUrl] = mockReplace.mock.calls[0] as [string, unknown];
    expect(calledUrl).not.toContain("new=");
    expect(calledUrl).not.toContain("new=1");
  });

  it("does NOT open the modal when ?new=1 is absent", () => {
    mockParamGet = () => null;
    mockParamsToString = () => "";

    render(<AddDealButton />);

    expect(screen.queryByText("Add new deal")).not.toBeInTheDocument();
  });

  it("opens the modal and preserves other params when ?new=1 is alongside additional params", async () => {
    mockParamGet = (key) => {
      if (key === "new") return "1";
      if (key === "view") return "board";
      if (key === "column") return "lead";
      return null;
    };
    mockParamsToString = () => "view=board&column=lead&new=1";

    render(<AddDealButton />);

    await waitFor(() =>
      expect(screen.getByText("Add new deal")).toBeInTheDocument()
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));

    const [calledUrl] = mockReplace.mock.calls[0] as [string, unknown];
    expect(calledUrl).not.toContain("new=");
    expect(calledUrl).toContain("view=board");
    expect(calledUrl).toContain("column=lead");
  });
});

// ---------------------------------------------------------------------------
// AddDealLink — click navigates to a URL containing new=1
// ---------------------------------------------------------------------------

describe("AddDealLink — click sets ?new=1 in the URL", () => {
  beforeEach(() => {
    mockParamGet = () => null;
    mockParamsToString = () => "";
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  it("navigates to a URL containing new=1 when clicked", async () => {
    render(<AddDealLink />);

    await userEvent.click(screen.getByRole("button", { name: /\+ add deal/i }));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const [calledUrl] = mockPush.mock.calls[0] as [string];
    expect(calledUrl).toContain("new=1");
  });

  it("also sets view=board in the navigation URL", async () => {
    render(<AddDealLink />);

    await userEvent.click(screen.getByRole("button", { name: /\+ add deal/i }));

    const [calledUrl] = mockPush.mock.calls[0] as [string];
    expect(calledUrl).toContain("view=board");
  });
});
