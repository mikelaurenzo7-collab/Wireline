import { describe, expect, it } from "vitest";
import type { DirectorPreviewMeta } from "./director-message-metadata";
import {
  assignStitchPreviewVersions,
  findLatestStitchPreview,
  isStitchPreview,
  stitchPreviewKey,
} from "./design-preview";

function stitch(overrides: Partial<DirectorPreviewMeta> = {}): DirectorPreviewMeta {
  return {
    conceptId: overrides.conceptId ?? "concept-1",
    title: overrides.title ?? "Landing page",
    rationale: overrides.rationale ?? "",
    previewDataUrl: overrides.previewDataUrl ?? "",
    kind: overrides.kind ?? "stitch",
    ...overrides,
  };
}

describe("isStitchPreview", () => {
  it("treats kind=stitch as a stitch render", () => {
    expect(isStitchPreview(stitch())).toBe(true);
  });

  it("recognizes legacy Google Stitch previews via rationale", () => {
    expect(isStitchPreview({ kind: "logo", rationale: "Generated with Google Stitch" })).toBe(true);
  });

  it("ignores non-stitch previews", () => {
    expect(isStitchPreview({ kind: "logo", rationale: "brand mark" })).toBe(false);
  });
});

describe("stitchPreviewKey", () => {
  it("prefers renderId over conceptId", () => {
    expect(stitchPreviewKey({ renderId: "r-9", conceptId: "c-1" })).toBe("r-9");
  });

  it("falls back to conceptId when renderId is absent", () => {
    expect(stitchPreviewKey({ conceptId: "c-1" })).toBe("c-1");
  });
});

describe("assignStitchPreviewVersions", () => {
  it("numbers distinct renders chronologically across director turns", () => {
    const messages = [
      { role: "operator", previews: undefined },
      { role: "director", previews: [stitch({ renderId: "r-1", conceptId: "c-1" })] },
      { role: "operator" },
      {
        role: "director",
        previews: [
          stitch({ renderId: "r-2", conceptId: "c-2" }),
          stitch({ renderId: "r-3", conceptId: "c-3" }),
        ],
      },
    ];
    const versions = assignStitchPreviewVersions(messages);
    expect(versions.get("r-1")).toBe(1);
    expect(versions.get("r-2")).toBe(2);
    expect(versions.get("r-3")).toBe(3);
    expect(versions.size).toBe(3);
  });

  it("reuses the same version number for a repeated render key", () => {
    const messages = [
      { role: "director", previews: [stitch({ renderId: "r-1" })] },
      { role: "director", previews: [stitch({ renderId: "r-1" })] },
    ];
    const versions = assignStitchPreviewVersions(messages);
    expect(versions.get("r-1")).toBe(1);
    expect(versions.size).toBe(1);
  });

  it("skips operator turns and non-stitch previews", () => {
    const messages = [
      { role: "operator", previews: [stitch({ renderId: "op" })] },
      {
        role: "director",
        previews: [{ ...stitch({ renderId: "logo" }), kind: "logo" as const, rationale: "mark" }],
      },
      { role: "director", previews: [stitch({ renderId: "r-1" })] },
    ];
    const versions = assignStitchPreviewVersions(messages);
    expect(versions.has("op")).toBe(false);
    expect(versions.has("logo")).toBe(false);
    expect(versions.get("r-1")).toBe(1);
  });
});

describe("findLatestStitchPreview", () => {
  it("returns the most recent director stitch preview", () => {
    const messages = [
      { id: "m1", role: "director", previews: [stitch({ renderId: "r-1", title: "First" })] },
      { id: "m2", role: "director", previews: [stitch({ renderId: "r-2", title: "Second" })] },
    ];
    const latest = findLatestStitchPreview(messages);
    expect(latest?.preview.title).toBe("Second");
    expect(latest?.messageId).toBe("m2");
  });

  it("returns null when there are no stitch previews", () => {
    expect(findLatestStitchPreview([{ id: "m1", role: "operator" }])).toBeNull();
  });
});
