import { beforeEach, describe, expect, it, vi } from "vitest";

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("../src/lib/server-context", () => ({
  drizzle: { select },
  log: { info: vi.fn(), warn: vi.fn() },
}));

import { getLearningDigest } from "../src/lib/agent-learning-loop";

function mockDigestRows(
  lessons: { lesson: string; status: string | null }[],
  calls: { id: number; outcomeTag: string; durationSeconds: number; createdAt: Date }[] = [],
) {
  select
    .mockReturnValueOnce({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => lessons }) }),
      }),
    })
    .mockReturnValueOnce({ from: () => ({ where: async () => calls }) });
}

beforeEach(() => {
  select.mockReset();
});

describe("learning digest accuracy", () => {
  it("does not report pending lessons as approved", async () => {
    mockDigestRows([
      { lesson: "Confirm the requested date", status: "pending" },
      { lesson: "Ask for a callback number", status: "pending" },
    ]);

    const digest = await getLearningDigest("user-1", "agent-1");

    expect(digest.lessonsPending).toBe(2);
    expect(digest.lessonsApproved).toBe(0);
    expect(digest.topLessons).toHaveLength(2);
  });

  it("counts only explicit approvals while preserving the pending and rejected states", async () => {
    mockDigestRows([
      { lesson: "Approved guidance", status: "approved" },
      { lesson: "Awaiting review", status: "pending" },
      { lesson: "Rejected guidance", status: "rejected" },
      { lesson: "Legacy guidance", status: null },
    ]);

    const digest = await getLearningDigest("user-1", "agent-1");

    expect(digest.lessonsApproved).toBe(1);
    expect(digest.lessonsPending).toBe(1);
    expect(digest.topLessons).not.toContain("Rejected guidance");
  });

  it("does not infer a learning benefit from dividing an odd number of calls in half", async () => {
    mockDigestRows(
      [{ lesson: "Approved guidance", status: "approved" }],
      Array.from({ length: 7 }, (_, index) => ({
        id: index + 1,
        outcomeTag: "info",
        durationSeconds: 60,
        createdAt: new Date("2026-09-26T12:00:00Z"),
      })),
    );

    const digest = await getLearningDigest("user-1", "agent-1");

    expect(digest.outcomeLiftPct).toBeNull();
  });

  it("returns an honest empty digest when no lessons or calls exist", async () => {
    mockDigestRows([]);

    expect(await getLearningDigest("user-1", "agent-1")).toEqual({
      agentId: "agent-1",
      lessonsPending: 0,
      lessonsApproved: 0,
      topLessons: [],
      outcomeLiftPct: null,
      objectionsTrending: [],
    });
  });
});
