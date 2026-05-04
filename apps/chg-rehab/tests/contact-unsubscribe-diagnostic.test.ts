// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getUnsubscribeLinkDiagnostic,
  resolvePublicAppOrigin,
  signUnsubscribeToken,
} from "@/lib/contactUnsubscribe";

const ENV_KEYS = [
  "APP_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "REPLIT_DOMAINS",
  "REPLIT_DEV_DOMAIN",
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function clearOriginEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  clearOriginEnv();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

describe("resolvePublicAppOrigin", () => {
  it("returns null origin and source when no env var is set", () => {
    expect(resolvePublicAppOrigin()).toEqual({ origin: null, source: null });
  });

  it("prefers APP_BASE_URL over every other source", () => {
    process.env.APP_BASE_URL = "https://app.example.com";
    process.env.NEXT_PUBLIC_APP_URL = "https://next.example.com";
    process.env.REPLIT_DOMAINS = "deploy.replit.app";
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://app.example.com",
      source: "APP_BASE_URL",
    });
  });

  it("falls back to NEXT_PUBLIC_APP_URL when APP_BASE_URL is unset", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://next.example.com";
    process.env.REPLIT_DOMAINS = "deploy.replit.app";
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://next.example.com",
      source: "NEXT_PUBLIC_APP_URL",
    });
  });

  it("falls back to REPLIT_DOMAINS when both explicit overrides are unset", () => {
    process.env.REPLIT_DOMAINS = "deploy.replit.app";
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://deploy.replit.app",
      source: "REPLIT_DOMAINS",
    });
  });

  it("falls back to REPLIT_DEV_DOMAIN when no other source is configured", () => {
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://dev.replit.dev",
      source: "REPLIT_DEV_DOMAIN",
    });
  });

  it("treats whitespace-only APP_BASE_URL as unset and falls through", () => {
    process.env.APP_BASE_URL = "   ";
    process.env.NEXT_PUBLIC_APP_URL = "https://next.example.com";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://next.example.com",
      source: "NEXT_PUBLIC_APP_URL",
    });
  });

  it("treats whitespace-only NEXT_PUBLIC_APP_URL as unset and falls through", () => {
    process.env.NEXT_PUBLIC_APP_URL = "   ";
    process.env.REPLIT_DOMAINS = "deploy.replit.app";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://deploy.replit.app",
      source: "REPLIT_DOMAINS",
    });
  });

  it("trims trailing slashes and surrounding whitespace from APP_BASE_URL", () => {
    process.env.APP_BASE_URL = "  https://app.example.com///  ";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://app.example.com",
      source: "APP_BASE_URL",
    });
  });

  it("trims trailing slashes and surrounding whitespace from NEXT_PUBLIC_APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "  https://next.example.com/  ";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://next.example.com",
      source: "NEXT_PUBLIC_APP_URL",
    });
  });

  it("picks the first entry of a comma-separated REPLIT_DOMAINS value and trims it", () => {
    process.env.REPLIT_DOMAINS = "  primary.replit.app  , secondary.replit.app , tertiary.replit.app";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://primary.replit.app",
      source: "REPLIT_DOMAINS",
    });
  });

  it("falls through REPLIT_DOMAINS when its first entry is blank", () => {
    process.env.REPLIT_DOMAINS = "   ,fallback.replit.app";
    process.env.REPLIT_DEV_DOMAIN = "dev.replit.dev";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://dev.replit.dev",
      source: "REPLIT_DEV_DOMAIN",
    });
  });

  it("trims surrounding whitespace from REPLIT_DEV_DOMAIN", () => {
    process.env.REPLIT_DEV_DOMAIN = "  dev.replit.dev  ";

    expect(resolvePublicAppOrigin()).toEqual({
      origin: "https://dev.replit.dev",
      source: "REPLIT_DEV_DOMAIN",
    });
  });
});

describe("getUnsubscribeLinkDiagnostic", () => {
  it("returns ok:false with a non-empty reason when no env var is set", () => {
    const diag = getUnsubscribeLinkDiagnostic();
    expect(diag.ok).toBe(false);
    expect(diag.origin).toBeNull();
    expect(diag.source).toBeNull();
    expect(diag.sampleUrl).toBeNull();
    expect(typeof diag.reason).toBe("string");
    expect(diag.reason && diag.reason.length).toBeGreaterThan(0);
  });

  it("returns ok:true with a well-formed sampleUrl when an env var is set", () => {
    process.env.APP_BASE_URL = "https://app.example.com/";

    const diag = getUnsubscribeLinkDiagnostic();
    expect(diag.ok).toBe(true);
    expect(diag.origin).toBe("https://app.example.com");
    expect(diag.source).toBe("APP_BASE_URL");
    expect(diag.reason).toBeNull();

    expect(diag.sampleUrl).not.toBeNull();
    const url = new URL(diag.sampleUrl as string);
    expect(url.origin).toBe("https://app.example.com");
    expect(url.pathname).toBe("/api/contacts/unsubscribe");
    const token = url.searchParams.get("token");
    expect(token).toBe(signUnsubscribeToken("sample-contact-id"));
    expect(token).toMatch(/^sample-contact-id\.[A-Za-z0-9_-]+$/);
  });

  it("reports the source the origin was resolved from when falling back to REPLIT_DOMAINS", () => {
    process.env.REPLIT_DOMAINS = "deploy.replit.app,other.replit.app";

    const diag = getUnsubscribeLinkDiagnostic();
    expect(diag.ok).toBe(true);
    expect(diag.origin).toBe("https://deploy.replit.app");
    expect(diag.source).toBe("REPLIT_DOMAINS");
    expect(diag.sampleUrl).not.toBeNull();
    const url = new URL(diag.sampleUrl as string);
    expect(url.origin).toBe("https://deploy.replit.app");
    expect(url.pathname).toBe("/api/contacts/unsubscribe");
  });
});
