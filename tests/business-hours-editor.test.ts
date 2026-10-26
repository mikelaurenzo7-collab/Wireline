import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", () => ({ authFetch: vi.fn() }));

import {
  businessHoursFromWeek,
  defaultHoursWeek,
  hoursWeekFromSaved,
  hoursWeekProblem,
} from "../src/components/BusinessHoursEditor";
import { buildAgentRuntimeContext, isWithinBusinessHours } from "../src/lib/agent-runtime";
import { AgentBusinessProfileSchema } from "../src/lib/form-validators";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("business hours editor", () => {
  it("starts owners on weekdays 9 to 5 and saves closed weekends", () => {
    const hours = businessHoursFromWeek(defaultHoursWeek());
    expect(hours).toMatchObject({
      mon: { open: "09:00", close: "17:00" },
      fri: { open: "09:00", close: "17:00" },
      sat: { closed: true },
      sun: { closed: true },
    });
    // Wednesday 2026-10-07 at 10:00 and 18:00 in Chicago (UTC-5).
    const profile = { business_hours: hours, timezone: "America/Chicago" };
    expect(isWithinBusinessHours(profile, new Date("2026-10-07T15:00:00Z"))).toBe(true);
    expect(isWithinBusinessHours(profile, new Date("2026-10-07T23:00:00Z"))).toBe(false);
    // 12:30Z is 8:30am in America/New_York, before the 9:00 opening.
    expect(
      isWithinBusinessHours({ business_hours: hours }, new Date("2026-10-07T12:30:00Z")),
    ).toBe(false);
    expect(
      isWithinBusinessHours(
        { business_hours: hours, timezone: "UTC" },
        new Date("2026-10-07T12:30:00Z"),
      ),
    ).toBe(true);
    expect(buildAgentRuntimeContext("base", { business_hours: hours }).prompt).toContain(
      "America/New_York",
    );
  });

  it("loads saved hours the way the runtime reads them and saves them back unchanged", () => {
    const saved = {
      mon: { open: "8:30", close: "18:00" },
      tue: { closed: true },
      fri: { open: "22:00", close: "02:00" },
      sat: { open: "10:00" },
    };
    const week = hoursWeekFromSaved(saved);
    expect(week.mon).toEqual({ open: true, from: "08:30", to: "18:00" });
    expect(week.tue.open).toBe(false);
    expect(week.fri).toEqual({ open: true, from: "22:00", to: "02:00" });
    // A day with no usable rule is open all day at runtime, and saves as no rule.
    expect(week.wed).toEqual({ open: true, from: "00:00", to: "23:59" });
    expect(week.sat).toEqual({ open: true, from: "00:00", to: "23:59" });
    expect(businessHoursFromWeek(week)).toEqual({
      mon: { open: "08:30", close: "18:00" },
      tue: { closed: true },
      fri: { open: "22:00", close: "02:00" },
    });
  });

  it("saves no schedule when every day is open all day", () => {
    const week = hoursWeekFromSaved({});
    for (const day of Object.values(week))
      Object.assign(day, { open: true, from: "00:00", to: "23:59" });
    expect(businessHoursFromWeek(week)).toBeNull();
  });

  it("refuses times that would never open or that are missing", () => {
    const week = defaultHoursWeek();
    expect(hoursWeekProblem(week)).toBeNull();
    week.tue = { open: true, from: "09:00", to: "09:00" };
    expect(hoursWeekProblem(week)).toMatch(/Tuesday opens and closes at the same time/);
    week.tue = { open: true, from: "", to: "17:00" };
    expect(hoursWeekProblem(week)).toBe("Enter Tuesday's opening and closing times.");
    week.tue = { open: false, from: "", to: "" };
    expect(hoursWeekProblem(week)).toBeNull();
  });
});

describe("business profile saves", () => {
  it("accepts a cleared schedule and refuses an unknown time zone", () => {
    expect(AgentBusinessProfileSchema.safeParse({ business_hours: null }).success).toBe(true);
    expect(AgentBusinessProfileSchema.safeParse({ timezone: "America/Chicago" }).success).toBe(
      true,
    );
    expect(AgentBusinessProfileSchema.safeParse({ timezone: "UTC" }).success).toBe(true);
    expect(AgentBusinessProfileSchema.safeParse({ timezone: "Mars/Olympus_Mons" }).success).toBe(
      false,
    );
  });

  it("changes only the fields a save sends", () => {
    const route = read("src/routes/agent-routes-v2.ts");
    const handler = route.slice(route.indexOf('"/api/agent-config/:id/business"'));
    expect(handler).toContain("if (parsed.escalation_handoff_enabled !== undefined) {");
    expect(handler).toContain("if (parsed.compliance_mode !== undefined)");
    expect(handler).not.toContain("escalation_handoff_enabled ?? false");
    expect(handler).toContain(".returning(BUSINESS_PROFILE_COLUMNS);");
  });

  it("puts the editor in Studio and saves through the business profile", () => {
    expect(read("src/components/StudioAgentWorkspacePanel.tsx")).toContain(
      "<BusinessHoursEditor agentId={agentId} compact={compact} />",
    );
    const editor = read("src/components/BusinessHoursEditor.tsx");
    expect(editor).toContain("/business`");
    expect(editor).toContain('method: "PATCH"');
    expect(editor).toContain("business_hours: useHours ? businessHoursFromWeek(week) : null,");
  });
});
