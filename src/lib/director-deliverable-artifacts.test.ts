import { describe, expect, it } from "vitest";
import {
  DELIVERABLE_ARTIFACT_MIN_CHARS,
  shouldPersistDeliverableArtifact,
} from "./director-deliverable-artifacts";

describe("director deliverable artifacts", () => {
  const longReply = "x".repeat(DELIVERABLE_ARTIFACT_MIN_CHARS + 100);

  it("persists for website and code intents", () => {
    expect(
      shouldPersistDeliverableArtifact("Design a website for my HVAC company", longReply),
    ).toBe(true);
    expect(
      shouldPersistDeliverableArtifact("Write TypeScript for a Zod-validated route", longReply),
    ).toBe(true);
  });

  it("skips short or error replies", () => {
    expect(shouldPersistDeliverableArtifact("hi", "short")).toBe(false);
    expect(
      shouldPersistDeliverableArtifact(
        "business plan",
        "Sorry — I'm having trouble responding right now.",
      ),
    ).toBe(false);
  });

  it("persists multi-section long replies", () => {
    const doc = `## One\n\n${"a".repeat(800)}\n\n## Two\n\n${"b".repeat(800)}\n\n## Three\n\n${"c".repeat(900)}`;
    expect(shouldPersistDeliverableArtifact("write something", doc)).toBe(true);
  });
});
