import { describe, expect, it } from "vitest";
import { isSafeExternalUrl, safeExternalHref } from "./safe-external-url";

describe("safeExternalHref", () => {
  it("allows http and https URLs", () => {
    expect(safeExternalHref("https://example.com/path")).toBe("https://example.com/path");
    expect(safeExternalHref("http://example.com")).toBe("http://example.com/");
  });

  it("rejects javascript, data, and other schemes", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,hello")).toBeNull();
    expect(safeExternalHref("file:///etc/passwd")).toBeNull();
  });

  it("rejects empty and malformed values", () => {
    expect(safeExternalHref("")).toBeNull();
    expect(safeExternalHref("   ")).toBeNull();
    expect(safeExternalHref("not-a-url")).toBeNull();
  });

  it("isSafeExternalUrl mirrors safeExternalHref", () => {
    expect(isSafeExternalUrl("https://wireline.com")).toBe(true);
    expect(isSafeExternalUrl("javascript:void(0)")).toBe(false);
  });
});
