import { describe, expect, it } from "vitest";
import { getRequestId, runWithRequestContext } from "./request-context";

describe("request-context", () => {
  it("returns undefined outside a request scope", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("propagates requestId inside runWithRequestContext", () => {
    runWithRequestContext("req-abc", () => {
      expect(getRequestId()).toBe("req-abc");
    });
    expect(getRequestId()).toBeUndefined();
  });
});
