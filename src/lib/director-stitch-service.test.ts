import { describe, expect, it } from "vitest";
import { mergeStitchScreenRecord } from "./google-stitch-mcp-client";

describe("director stitch asset hints", () => {
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
