import { describe, expect, it } from "vitest";
import { findLatestStitchPreview, isStitchPreview } from "./director-stitch-preview";

describe("director stitch preview helpers", () => {
  it("detects stitch previews by kind", () => {
    expect(isStitchPreview({ kind: "stitch", rationale: "" })).toBe(true);
    expect(isStitchPreview({ kind: "logo", rationale: "Google Stitch" })).toBe(true);
    expect(isStitchPreview({ kind: "logo", rationale: "Brand pack" })).toBe(false);
  });

  it("finds the latest stitch preview in thread order", () => {
    const latest = findLatestStitchPreview([
      { id: "1", role: "operator", previews: [] },
      {
        id: "2",
        role: "director",
        previews: [{ conceptId: "a", title: "A", rationale: "", previewDataUrl: "", kind: "logo" }],
      },
      {
        id: "3",
        role: "director",
        previews: [
          {
            conceptId: "b",
            title: "B",
            rationale: "Wireline Design",
            previewDataUrl: "",
            kind: "stitch",
          },
        ],
      },
    ]);
    expect(latest?.messageId).toBe("3");
    expect(latest?.preview.conceptId).toBe("b");
  });
});
