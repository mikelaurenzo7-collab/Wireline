import { describe, expect, it } from "vitest";
import {
  buildDirectorMetadataFromTurn,
  completedStitchPreviewsForSession,
  mergeCompletedStitchPreviewMetadata,
  packDirectorMetadata,
  parseDirectorMetadata,
  stitchSessionMatches,
  type DirectorMessageMetadata,
  type DirectorPreviewMeta,
} from "./director-message-metadata";

const session = { projectId: "project-1", screenId: "screen-1" };

const preview: DirectorPreviewMeta = {
  conceptId: "screen-1",
  title: "Mobile screen",
  rationale: "Wireline Design",
  previewDataUrl: "",
  kind: "stitch",
  htmlArtifactId: "101",
  deviceType: "MOBILE",
};

describe("director message metadata", () => {
  it("packs and parses structured reply fields", () => {
    const packed = packDirectorMetadata({
      suggestions: [{ kind: "view_ops", label: "Open ops" }],
      clarifyingQuestions: ["What palette?"],
    });
    expect(packed).toBeTruthy();
    const parsed = parseDirectorMetadata(packed);
    expect(parsed.suggestions?.[0]?.kind).toBe("view_ops");
    expect(parsed.clarifyingQuestions).toEqual(["What palette?"]);
  });

  it("builds proposals from turn payload", () => {
    const meta = buildDirectorMetadataFromTurn({
      reply: "hi",
      actions: [{ kind: "send_email", agent_id: "a1", subject: "s", body: "b" }],
      integrationJobs: [],
      focusAgentId: "agent-1",
      focusAgentName: "Ava",
      mode: "coach",
    });
    expect(meta.proposals?.actions).toHaveLength(1);
    expect(meta.coachAgentId).toBe("agent-1");
    expect(meta.mode).toBe("coach");
  });

  it("returns null pack when empty", () => {
    expect(packDirectorMetadata({})).toBeNull();
  });

  it("packs deliverable artifact download metadata", () => {
    const packed = packDirectorMetadata({
      deliverableArtifact: {
        id: "42",
        name: "website-hvac-2026-06-05.md",
        artifactType: "markdown-deliverable",
        mimeType: "text/markdown",
        sizeBytes: 4096,
        downloadUrl: "/api/director/artifacts?id=42",
      },
    });
    expect(packed).toBeTruthy();
    expect(parseDirectorMetadata(packed).deliverableArtifact?.name).toContain(".md");
  });

  it("merges completed Stitch previews and clears pending state", () => {
    const meta: DirectorMessageMetadata = {
      stitchSession: { ...session, projectTitle: "Wireline", deviceType: "MOBILE" },
      stitchAssetsPending: true,
      modelLabel: "Wireline Design",
    };

    const merged = mergeCompletedStitchPreviewMetadata(meta, session, [preview]);

    expect(merged?.previews).toEqual([preview]);
    expect(merged?.stitchAssetsPending).toBeUndefined();
    expect(merged?.stitchSession?.projectTitle).toBe("Wireline");
    expect(merged?.stitchSession?.deviceType).toBe("MOBILE");
    expect(merged?.modelLabel).toBe("Wireline Design");
  });

  it("finds persisted completed Stitch previews for a matching session", () => {
    const meta: DirectorMessageMetadata = {
      stitchSession: session,
      previews: [preview, { ...preview, conceptId: "other-screen" }],
    };

    expect(completedStitchPreviewsForSession(meta, session)).toEqual([preview]);
  });

  it("does not merge previews into a mismatched Stitch session", () => {
    const meta: DirectorMessageMetadata = {
      stitchSession: { projectId: "project-2", screenId: "screen-1" },
      stitchAssetsPending: true,
    };

    expect(mergeCompletedStitchPreviewMetadata(meta, session, [preview])).toBeNull();
  });

  it("requires render ids to match when a Stitch render is server-owned", () => {
    const meta: DirectorMessageMetadata = {
      stitchSession: { ...session, renderId: "render-a", deviceType: "MOBILE" },
      stitchAssetsPending: true,
      previews: [{ ...preview, renderId: "render-a" }],
    };

    expect(stitchSessionMatches(meta, { ...session, renderId: "render-a" })).toBe(true);
    expect(stitchSessionMatches(meta, { ...session, renderId: "render-b" })).toBe(false);
    expect(
      stitchSessionMatches(meta, { ...session, renderId: "render-a", deviceType: "DESKTOP" }),
    ).toBe(false);
    expect(
      completedStitchPreviewsForSession(meta, { ...session, renderId: "render-b" }),
    ).toBeNull();
  });

  it("preserves unrelated previews when completing a Stitch render", () => {
    const logoPreview: DirectorPreviewMeta = {
      conceptId: "logo-1",
      title: "Logo concept",
      rationale: "Generated logo",
      previewDataUrl: "data:image/svg+xml;base64,abc",
      kind: "logo",
    };
    const otherStitchPreview: DirectorPreviewMeta = {
      ...preview,
      conceptId: "screen-2",
      renderId: "render-other",
    };
    const completed = { ...preview, renderId: "render-a" };
    const meta: DirectorMessageMetadata = {
      stitchSession: { ...session, renderId: "render-a", deviceType: "MOBILE" },
      stitchAssetsPending: true,
      previews: [logoPreview, otherStitchPreview, { ...preview, renderId: "render-a" }],
    };

    const merged = mergeCompletedStitchPreviewMetadata(
      meta,
      { ...session, renderId: "render-a", deviceType: "MOBILE" },
      [completed],
    );

    expect(merged?.previews).toEqual([logoPreview, otherStitchPreview, completed]);
    expect(merged?.stitchSession?.renderId).toBe("render-a");
    expect(merged?.stitchAssetsPending).toBeUndefined();
  });
});
