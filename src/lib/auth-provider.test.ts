import { describe, expect, it } from "vitest";
import { isClerkAuthEnabled, isWirelineNativeAuthEnabled } from "./auth-provider";

describe("auth-provider", () => {
  it("always uses Wireline native auth", () => {
    expect(isClerkAuthEnabled()).toBe(false);
    expect(isWirelineNativeAuthEnabled()).toBe(true);
  });
});
