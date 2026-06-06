import { describe, expect, it } from "vitest";
import { isAllowedStitchAssetHost, sanitizeStitchAssetUrl } from "./google-stitch-asset-url";

describe("google stitch asset url", () => {
  it("allows Google storage hosts", () => {
    expect(isAllowedStitchAssetHost("storage.googleapis.com")).toBe(true);
    expect(sanitizeStitchAssetUrl("https://storage.googleapis.com/bucket/screen.html")).toContain(
      "storage.googleapis.com",
    );
  });

  it("blocks non-Google hosts", () => {
    expect(isAllowedStitchAssetHost("evil.example")).toBe(false);
    expect(sanitizeStitchAssetUrl("https://evil.example/steal-key")).toBe("");
  });
});
