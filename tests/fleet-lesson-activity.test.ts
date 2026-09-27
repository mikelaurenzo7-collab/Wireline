import { describe, expect, it } from "vitest";
import { compileActivityFeed } from "../src/lib/fleet-activity";

describe("generated lesson activity", () => {
  it("presents stored analysis as a suggestion rather than a confirmed runtime change", () => {
    const [activity] = compileActivityFeed({
      logs: [],
      tasks: [],
      emails: [],
      lessons: [
        { id: 1n, lesson: "Confirm the callback number.", createdAt: "2026-09-27T10:00:00Z" },
      ],
    });
    expect(activity).toMatchObject({
      id: "1",
      action: "Suggested lesson: Confirm the callback number.",
      trigger: "Lesson review",
      meta: "Suggested improvement",
      type: "NEURAL_OPTIMIZATION",
    });
  });
});
