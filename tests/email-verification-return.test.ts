import { describe, expect, it } from "vitest";
import {
  emailVerificationSignInNotice,
  readEmailVerificationReturn,
} from "../src/lib/email-verification-return";

describe("email verification navigation hints", () => {
  it.each(["1", "expired", "error"] as const)(
    "reads the %s return directly and through sign-in",
    (result) => {
      expect(readEmailVerificationReturn(`?verified=${result}`)).toBe(result);
      expect(
        readEmailVerificationReturn(
          `?redirect=${encodeURIComponent(`/studio?verified=${result}`)}`,
        ),
      ).toBe(result);
    },
  );

  it.each([
    "https://example.test/studio?verified=1",
    "//example.test/studio?verified=1",
    "/\\example.test/studio?verified=1",
    "/studio\n?verified=1",
    "/settings?verified=1",
    "/signin?verified=1",
    "/studio?verified=unknown",
    "/studio?redirect=%2Fstudio%3Fverified%3D1",
  ])("ignores an unsafe, unrelated, or unsupported return: %s", (redirect) => {
    expect(readEmailVerificationReturn(`?redirect=${encodeURIComponent(redirect)}`)).toBeNull();
  });

  it("does not turn an unrecognized result into a successful nested return", () => {
    expect(
      readEmailVerificationReturn("?verified=no&redirect=%2Fstudio%3Fverified%3D1"),
    ).toBeNull();
    expect(readEmailVerificationReturn("?verified=true")).toBeNull();
    expect(readEmailVerificationReturn("")).toBeNull();
  });

  it("treats a success hint as navigation guidance, not proof about the signed-in account", () => {
    const notice = emailVerificationSignInNotice("1");
    expect(notice.tone).toBe("info");
    expect(notice.message).toContain("Sign in to confirm your email status");
    expect(notice.title).not.toBe("Email verified");
  });
});
