import { describe, expect, it } from "vitest";
import {
  readRedirectFromSearch,
  resolvePostAuthDestination,
} from "./auth-redirect";

describe("auth-redirect", () => {
  it("honors redirect query when safe", () => {
    expect(readRedirectFromSearch("?redirect=%2Fapp%2Fbusiness%2Flive")).toBe(
      "/app/business/live",
    );
    expect(readRedirectFromSearch("?redirect=https://evil.com")).toBeNull();
    expect(readRedirectFromSearch("?redirect=/signin")).toBeNull();
  });

  it("defaults to workspace home", () => {
    expect(resolvePostAuthDestination("business", "")).toBe("/app/business");
    expect(resolvePostAuthDestination("personal", "")).toBe("/app/personal");
  });
});
