import { describe, it, expect } from "vitest";
import {
  buildDirectorMetadataFromTurn,
  packDirectorMetadata,
  parseDirectorMetadata,
} from "./director-message-metadata";

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
});
