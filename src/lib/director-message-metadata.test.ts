import { describe, expect, it } from "vitest";
import {
  buildDirectorMetadataFromTurn,
  completedStitchPreviewsForSession,
  mergeCompletedStitchPreviewMetadata,
  packDirectorMetadata,
  parseDirectorMetadata,
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
});
