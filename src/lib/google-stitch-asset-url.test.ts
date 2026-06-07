import { describe, expect, it, vi } from "vitest";
import {
  fetchStitchAssetUrl,
  isAllowedStitchAssetHost,
  sanitizeStitchAssetUrl,
} from "./google-stitch-asset-url";

describe("google stitch asset url", () => {
  it("allows Google storage hosts", () => {
    expect(isAllowedStitchAssetHost("storage.googleapis.com")).toBe(true);
    expect(sanitizeStitchAssetUrl("https://storage.googleapis.com/bucket/screen.html")).toContain(
      "storage.googleapis.com",
    );
  });

  it("allows Stitch HTML asset host (contribution.usercontent.google.com)", () => {
    expect(isAllowedStitchAssetHost("contribution.usercontent.google.com")).toBe(true);
    expect(
      sanitizeStitchAssetUrl(
        "https://contribution.usercontent.google.com/download?c=abc123",
      ),
    ).toContain("contribution.usercontent.google.com");
  });

  it("allows other google.com subdomains", () => {
    expect(isAllowedStitchAssetHost("storage.google.com")).toBe(true);
    expect(isAllowedStitchAssetHost("stitch.google.com")).toBe(true);
    expect(isAllowedStitchAssetHost("lh3.googleusercontent.com")).toBe(true);
  });

  it("blocks non-Google hosts", () => {
    expect(isAllowedStitchAssetHost("evil.example")).toBe(false);
    expect(sanitizeStitchAssetUrl("https://evil.example/steal-key")).toBe("");
    expect(isAllowedStitchAssetHost("fakegoogle.com")).toBe(false);
    expect(isAllowedStitchAssetHost("google.com.evil.org")).toBe(false);
  });

  it("downloads signed GCS assets with plain fetch (no API key header)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("<html>ok</html>").buffer,
    });
    vi.stubGlobal("fetch", fetchMock);
    const buf = await fetchStitchAssetUrl("https://storage.googleapis.com/bucket/screen.html");
    expect(buf.toString("utf8")).toContain("<html>ok</html>");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://storage.googleapis.com/bucket/screen.html",
      expect.objectContaining({ signal: undefined }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(headers).toBeUndefined();
    vi.unstubAllGlobals();
  });
});
