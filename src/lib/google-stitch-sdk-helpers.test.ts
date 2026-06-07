import { describe, expect, it } from "vitest";
import { mapStitchError } from "./google-stitch-sdk-helpers";
import { GoogleStitchError } from "./google-stitch-mcp-client";

describe("mapStitchError", () => {
  it("classifies platform timeouts as recoverable network errors", () => {
    const err = mapStitchError(new Error("FUNCTION_INVOCATION_TIMEOUT"));
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.recoverable).toBe(true);
  });

  it("preserves GoogleStitchError instances", () => {
    const original = new GoogleStitchError("auth", "AUTH_FAILED", false);
    expect(mapStitchError(original)).toBe(original);
  });

  it("treats unknown errors as non-recoverable", () => {
    const err = mapStitchError(new Error("something unexpected"));
    expect(err.code).toBe("UNKNOWN_ERROR");
    expect(err.recoverable).toBe(false);
  });
});
