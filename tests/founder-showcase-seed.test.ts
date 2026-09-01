import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertedValues: Array<Record<string, unknown>> = [];
  const onConflictDoNothing = vi.fn(async () => undefined);
  const values = vi.fn((value: Record<string, unknown>) => {
    insertedValues.push(value);
    return { onConflictDoNothing };
  });
  const insert = vi.fn(() => ({ values }));
  const update = vi.fn();
  return { insertedValues, insert, onConflictDoNothing, update, values };
});

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    insert: mocks.insert,
    update: mocks.update,
  },
}));

import { ensureFounderShowcaseBots } from "../src/lib/founder-showcase-seed";

describe("founder showcase creation defaults", () => {
  beforeEach(() => {
    mocks.insertedValues.length = 0;
    mocks.insert.mockClear();
    mocks.onConflictDoNothing.mockClear();
    mocks.update.mockClear();
    mocks.values.mockClear();
  });

  it("creates OpenAI defaults without updating an existing dogfooded Bot", async () => {
    await ensureFounderShowcaseBots("founder-user-id");

    expect(mocks.insertedValues.length).toBeGreaterThan(0);
    expect(mocks.insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "founder-user-id",
          voiceProvider: "openai",
          phoneVoiceProvider: "openai",
        }),
      ]),
    );
    expect(
      mocks.insertedValues.every(
        (row) =>
          typeof row.voiceId === "string" &&
          row.voiceId === row.phoneVoiceId &&
          typeof row.firstMessage === "string" &&
          typeof row.systemPromptOverride === "string" &&
          Array.isArray(row.enabledTools),
      ),
    ).toBe(true);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledTimes(mocks.insertedValues.length);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
