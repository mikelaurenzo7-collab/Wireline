import { describe, expect, it } from "vitest";
import { mergeStitchScreenRecord } from "./google-stitch-mcp-client";

/** Mirror production merge — generate-time URLs must survive empty get_screen polls. */
function mergeStitchScreenAssetFields(
  seed: Record<string, unknown>,
  fresh: Record<string, unknown>,
): Record<string, unknown> {
  function pickUrl(block: unknown): string | null {
    if (!block || typeof block !== "object") return null;
    const o = block as Record<string, unknown>;
    for (const key of ["downloadUrl", "uri", "url"]) {
      const raw = o[key];
      if (typeof raw === "string" && raw.startsWith("http")) return raw;
    }
    return null;
  }
  const merged = mergeStitchScreenRecord(seed, fresh);
  for (const field of ["htmlCode", "html", "screenshot", "image"] as const) {
    if (!pickUrl(fresh[field]) && pickUrl(seed[field])) merged[field] = seed[field];
  }
  return merged;
}

describe("director stitch asset hints", () => {
  it("preserves generate-time htmlCode when get_screen poll is still empty", () => {
    const seed = {
      screenId: "abc",
      htmlCode: { downloadUrl: "https://storage.googleapis.com/gen.html" },
    };
    const fresh = { screenId: "abc", htmlCode: { state: "PACKAGING" } };
    const merged = mergeStitchScreenAssetFields(seed, fresh);
    expect(mergeStitchScreenRecord(seed, fresh).htmlCode).toEqual({ state: "PACKAGING" });
    expect(merged.htmlCode).toEqual(seed.htmlCode);
  });

  it("merges nested htmlCode and screenshot download URLs from get_screen payloads", () => {
    const merged = mergeStitchScreenRecord(
      { screenId: "42", projectId: "99" },
      {
        screen: {
          htmlCode: { file: { downloadUrl: "https://storage.googleapis.com/a.html" } },
          screenshot: { assets: [{ downloadUrl: "https://storage.googleapis.com/a.png" }] },
        },
      },
    );
    expect(merged.screenId).toBe("42");
    expect(merged.htmlCode).toBeDefined();
    expect(merged.screenshot).toBeDefined();
  });
});
