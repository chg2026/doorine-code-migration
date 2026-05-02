// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/contactUnsubscribe";

const SECRET_KEY = "SESSION_SECRET";
const savedSecret: { value: string | undefined } = { value: undefined };

beforeEach(() => {
  savedSecret.value = process.env[SECRET_KEY];
  process.env[SECRET_KEY] = "test-secret-that-is-long-enough-32chars!";
});

afterEach(() => {
  if (savedSecret.value === undefined) {
    delete process.env[SECRET_KEY];
  } else {
    process.env[SECRET_KEY] = savedSecret.value;
  }
});

describe("signUnsubscribeToken / verifyUnsubscribeToken — round-trip", () => {
  it("round-trips a plain contact id", () => {
    const contactId = "contact-abc-123";
    const token = signUnsubscribeToken(contactId);
    expect(verifyUnsubscribeToken(token)).toEqual({ contactId });
  });

  it("round-trips a contact id that contains dots (lastIndexOf parsing)", () => {
    const contactId = "user.name.with.dots";
    const token = signUnsubscribeToken(contactId);
    expect(verifyUnsubscribeToken(token)).toEqual({ contactId });
  });

  it("round-trips a uuid-style contact id", () => {
    const contactId = "550e8400-e29b-41d4-a716-446655440000";
    const token = signUnsubscribeToken(contactId);
    expect(verifyUnsubscribeToken(token)).toEqual({ contactId });
  });
});

describe("verifyUnsubscribeToken — tampering rejection", () => {
  it("returns null when the contact id is swapped to a different value", () => {
    const token = signUnsubscribeToken("contact-real");
    const idx = token.lastIndexOf(".");
    const sig = token.slice(idx);
    const tampered = `contact-attacker${sig}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("returns null when a single byte of the signature is flipped", () => {
    const token = signUnsubscribeToken("contact-abc");
    const idx = token.lastIndexOf(".");
    const contactId = token.slice(0, idx);
    const sig = token.slice(idx + 1);
    const sigChars = sig.split("");
    sigChars[0] = sigChars[0] === "A" ? "B" : "A";
    const tampered = `${contactId}.${sigChars.join("")}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("returns null when the separator dot is missing (bare contact id only)", () => {
    expect(verifyUnsubscribeToken("contact-abc")).toBeNull();
  });

  it("returns null when the contact id portion is empty (dot at position 0)", () => {
    const token = signUnsubscribeToken("contact-abc");
    const sig = token.slice(token.lastIndexOf(".") + 1);
    expect(verifyUnsubscribeToken(`.${sig}`)).toBeNull();
  });

  it("returns null when the signature portion is empty (trailing dot)", () => {
    expect(verifyUnsubscribeToken("contact-abc.")).toBeNull();
  });

  it("returns null for a non-string input (number)", () => {
    expect(verifyUnsubscribeToken(42 as unknown as string)).toBeNull();
  });

  it("returns null for a non-string input (null)", () => {
    expect(verifyUnsubscribeToken(null as unknown as string)).toBeNull();
  });

  it("returns null for a non-string input (object)", () => {
    expect(verifyUnsubscribeToken({} as unknown as string)).toBeNull();
  });

  it("returns null when the token was signed under a different SESSION_SECRET", () => {
    const token = signUnsubscribeToken("contact-abc");

    process.env[SECRET_KEY] = "completely-different-secret-32chars!!";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });
});
