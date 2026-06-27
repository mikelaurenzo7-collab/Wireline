import { describe, expect, it } from "vitest";
import { readRedirectFromSearch, resolvePostAuthDestination } from "./auth-redirect";

describe("auth-redirect", () => {
  it("honors redirect query when safe", () => {
    expect(readRedirectFromSearch("?redirect=%2Fapp%2Fbusiness%2Flive")).toBe("/app/business/live");
    expect(readRedirectFromSearch("?redirect=https://evil.com")).toBeNull();
    expect(readRedirectFromSearch("?redirect=/signin")).toBeNull();
  });

  it("defaults to /overview (Home) for returning users; fresh signups are sent to Studio create once then default to overview", () => {
    expect(resolvePostAuthDestination("business", "")).toBe("/overview");
    expect(resolvePostAuthDestination("personal", "")).toBe("/overview");
    // Note: testing the fresh branch requires mocking sessionStorage; it consumes the flag and returns studio create.
  });
});
