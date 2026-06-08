import { describe, expect, it } from "vitest";
import {
  AUTH_SESSION_EXPIRED_MESSAGE,
  isAuthHttpStatus,
  parseApiErrorFromText,
} from "./api";

describe("api session helpers", () => {
  it("isAuthHttpStatus flags 401 and 403", () => {
    expect(isAuthHttpStatus(401)).toBe(true);
    expect(isAuthHttpStatus(403)).toBe(true);
    expect(isAuthHttpStatus(500)).toBe(false);
  });

  it("parseApiErrorFromText reads JSON auth errors", () => {
    expect(
      parseApiErrorFromText(
        JSON.stringify({ error: "No authorization token provided", code: "AUTH_REQUIRED" }),
        401,
      ),
    ).toEqual({
      error: "No authorization token provided",
      code: "AUTH_REQUIRED",
    });
  });

  it("parseApiErrorFromText falls back for non-JSON bodies", () => {
    const body = parseApiErrorFromText("upstream timeout", 504);
    expect(body.error).toContain("temporarily unavailable");
  });

  it("AUTH_SESSION_EXPIRED_MESSAGE is user-facing", () => {
    expect(AUTH_SESSION_EXPIRED_MESSAGE).toMatch(/sign in again/i);
  });
});
