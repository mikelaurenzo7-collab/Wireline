import { describe, expect, it, vi } from "vitest";

const { selectMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
}));

vi.mock("./server-context", () => ({
  drizzle: {
    select: selectMock,
  },
  log: { warn: vi.fn() },
}));

vi.mock("../db/schema", () => ({
  agents: {
    id: "id",
    userId: "userId",
    name: "name",
    role: "role",
    channel: "channel",
    voiceId: "voiceId",
    firstMessage: "firstMessage",
    enabledTools: "enabledTools",
    createdAt: "createdAt",
  },
}));

import { listAgentsForUser } from "./agents-store";

function chain(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  return { from, where, orderBy, limit };
}

describe("listAgentsForUser", () => {
  it("returns full rows when schema matches", async () => {
    const rows = [{ id: "a1", userId: "u1", name: "Jordan" }];
    selectMock.mockReturnValueOnce(chain(rows));

    await expect(listAgentsForUser("u1")).resolves.toEqual(rows);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to projection when a column is missing", async () => {
    const err = Object.assign(new Error('column "system_prompt_override" does not exist'), {
      code: "42703",
    });
    const fallbackRows = [{ id: "a1", userId: "u1", name: "Jordan", role: "sales" }];

    selectMock
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(err),
            }),
          }),
        }),
      })
      .mockReturnValueOnce(chain(fallbackRows));

    await expect(listAgentsForUser("u1")).resolves.toEqual(fallbackRows);
    expect(selectMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
