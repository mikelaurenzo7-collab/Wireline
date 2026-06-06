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

  it("blocks non-Google hosts", () => {
    expect(isAllowedStitchAssetHost("evil.example")).toBe(false);
    expect(sanitizeStitchAssetUrl("https://evil.example/steal-key")).toBe("");
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
