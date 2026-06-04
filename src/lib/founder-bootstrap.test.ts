import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResult: [{ n: 0 }] as Array<{ n: number }>,
  seedFounderFleet: vi.fn(async () => ({
    agentsCreated: 1,
    agentsUpdated: 0,
    knowledgeInserted: 0,
    directivesInserted: 0,
    lessonsInserted: 0,
    agentIds: ["founder-jordan"],
  })),
}));

vi.mock("./server-context", () => ({
  drizzle: {
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        execute: vi.fn(),
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(async () => mocks.selectResult),
          })),
        })),
      }),
    ),
  },
  log: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock("./founder-fleet-seed", () => ({
  seedFounderFleet: mocks.seedFounderFleet,
}));

vi.mock("./auth-service", () => ({
  isOwnerEmail: vi.fn((email: string | null | undefined) => email === "founder@wireline.com"),
}));

import { bootstrapFounderFleetIfEmpty, resetFounderBootstrapForTests } from "./founder-bootstrap";
import { isOwnerEmail } from "./auth-service";

describe("founder-bootstrap", () => {
  beforeEach(() => {
    resetFounderBootstrapForTests();
    mocks.selectResult = [{ n: 0 }];
    mocks.seedFounderFleet.mockClear();
    vi.mocked(isOwnerEmail).mockImplementation((email) => email === "founder@wireline.com");
  });

  it("skips non-owner accounts", async () => {
    const result = await bootstrapFounderFleetIfEmpty("user-1", "guest@wireline.com");
    expect(result).toEqual({ seeded: false, skipped: true });
    expect(mocks.seedFounderFleet).not.toHaveBeenCalled();
  });

  it("seeds when owner has zero agents", async () => {
    const result = await bootstrapFounderFleetIfEmpty("user-1", "founder@wireline.com");
    expect(result).toEqual({ seeded: true, skipped: false });
    expect(mocks.seedFounderFleet).toHaveBeenCalledWith("user-1");
  });

  it("skips when owner already has agents", async () => {
    mocks.selectResult = [{ n: 3 }];
    const result = await bootstrapFounderFleetIfEmpty("user-1", "founder@wireline.com");
    expect(result).toEqual({ seeded: false, skipped: true });
    expect(mocks.seedFounderFleet).not.toHaveBeenCalled();
  });
});
