import { describe, it, expect } from "vitest";
import {
  DIRECTOR_STUB_REPLY,
  collapseDirectorThreadDuplicates,
  isDirectorStubReply,
  isRecoverableDirectorPayload,
  isSubstantiveDirectorReply,
  operatorTurnHasDirectorReply,
} from "./director-reply-utils";

describe("director-reply-utils", () => {
  it("detects stub and substantive replies", () => {
    expect(isDirectorStubReply(DIRECTOR_STUB_REPLY)).toBe(true);
    expect(isSubstantiveDirectorReply(DIRECTOR_STUB_REPLY)).toBe(false);
    expect(isSubstantiveDirectorReply("x".repeat(200))).toBe(true);
  });

  it("detects stitch director reply after matching operator turn", () => {
    const good = "A".repeat(200);
    expect(
      operatorTurnHasDirectorReply(
        [
          { role: "operator", content: "Design a landing page" },
          {
            role: "director",
            content: good,
            modelLabel: "Wireline Design",
            previews: [{ kind: "stitch" }],
          },
        ],
        "Design a landing page",
        { requireStitch: true },
      ),
    ).toBe(true);
  });

  it("treats short coach replies with Apply proposals as recoverable", () => {
    expect(
      isRecoverableDirectorPayload({
        reply: "Approve these training updates for Mira.",
        changes: [{ agentId: "a1", field: "directive", value: "test" }],
      }),
    ).toBe(true);
    expect(
      operatorTurnHasDirectorReply(
        [
          { role: "operator", content: "Train Mira" },
          {
            role: "director",
            content: "Here are four updates — review and Apply.",
            proposals: { changes: [{ agentId: "a1" }] },
          },
        ],
        "Train Mira",
      ),
    ).toBe(true);
  });

  it("treats stitch clarifying questions as a recovered director reply", () => {
    expect(
      operatorTurnHasDirectorReply(
        [
          { role: "operator", content: "Design a landing page" },
          {
            role: "director",
            content: "Before I generate screens, I need a bit more context.",
            modelLabel: "Wireline Design",
            clarifyingQuestions: ["Who is the primary audience?"],
          },
        ],
        "Design a landing page",
        { requireStitch: true },
      ),
    ).toBe(true);
  });

  it("collapses stub director rows after substantive reply for same operator turn", () => {
    const good = "A".repeat(200);
    const thread = collapseDirectorThreadDuplicates([
      { role: "operator", content: "Build me a website" },
      { role: "director", content: good },
      { role: "director", content: DIRECTOR_STUB_REPLY },
    ]);
    expect(thread).toHaveLength(2);
    expect(thread[1].content).toBe(good);
  });
});
