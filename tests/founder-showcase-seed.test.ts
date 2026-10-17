import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const insertedValues: Array<Record<string, unknown>> = [];
  const selectedRows: Array<Array<{ enabledTools: unknown }>> = [];
  const updatedValues: Array<Record<string, unknown>> = [];
  const onConflictDoNothing = vi.fn(async () => undefined);
  const values = vi.fn((value: Record<string, unknown>) => {
    insertedValues.push(value);
    return { onConflictDoNothing };
  });
  const insert = vi.fn(() => ({ values }));
  const limit = vi.fn(async () => selectedRows.shift() || []);
  const select = vi.fn(() => ({ from: () => ({ where: () => ({ limit }) }) }));
  const updateWhere = vi.fn(async () => undefined);
  const set = vi.fn((value: Record<string, unknown>) => {
    updatedValues.push(value);
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set }));
  return {
    insertedValues,
    selectedRows,
    updatedValues,
    insert,
    limit,
    onConflictDoNothing,
    select,
    set,
    update,
    updateWhere,
    values,
  };
});

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    insert: mocks.insert,
    select: mocks.select,
    update: mocks.update,
  },
}));

import { ensureFounderShowcaseBots } from "../src/lib/founder-showcase-seed";
import {
  isLegacyFounderShowcaseToolSelection,
  showcaseToolNamesForKind,
} from "../src/lib/showcase-assistant";

describe("founder showcase creation defaults", () => {
  beforeEach(() => {
    mocks.insertedValues.length = 0;
    mocks.selectedRows.length = 0;
    mocks.updatedValues.length = 0;
    mocks.insert.mockClear();
    mocks.onConflictDoNothing.mockClear();
    mocks.update.mockClear();
    mocks.select.mockClear();
    mocks.set.mockClear();
    mocks.updateWhere.mockClear();
    mocks.limit.mockClear();
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

  it("publishes safe manual follow-up for founder customer service but not demos", () => {
    expect(showcaseToolNamesForKind("cs")).toContain("create_followup_task");
    expect(showcaseToolNamesForKind("cs")).not.toContain("schedule_callback");
    expect(showcaseToolNamesForKind("demo")).not.toContain("create_followup_task");
    expect(showcaseToolNamesForKind("demo")).not.toContain("schedule_callback");
  });

  it("recognizes only the exact old four-tool founder CS default", () => {
    const old = ["send_signup_link", "send_payment_link", "schedule_callback", "escalate_to_human"];
    expect(isLegacyFounderShowcaseToolSelection(old)).toBe(true);
    expect(isLegacyFounderShowcaseToolSelection([...old].reverse())).toBe(true);
    expect(isLegacyFounderShowcaseToolSelection([...old, "create_followup_task"])).toBe(false);
    expect(isLegacyFounderShowcaseToolSelection([...old.slice(0, 3), old[0]])).toBe(false);
    expect(isLegacyFounderShowcaseToolSelection(old.slice(0, 3))).toBe(false);
    expect(isLegacyFounderShowcaseToolSelection(null)).toBe(false);
  });

  it("reconciles only an exact legacy CS selection and preserves a customized one", async () => {
    mocks.selectedRows.push(
      [
        {
          enabledTools: [
            "send_payment_link",
            "schedule_callback",
            "send_signup_link",
            "escalate_to_human",
          ],
        },
      ],
      [{ enabledTools: ["send_signup_link", "create_followup_task"] }],
    );

    await ensureFounderShowcaseBots("founder-user-id");

    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.updatedValues).toEqual([{ enabledTools: showcaseToolNamesForKind("cs") }]);
  });
});
