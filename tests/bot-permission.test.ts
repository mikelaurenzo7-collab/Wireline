import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  actionExecutionMode,
  autonomyFromPermissionLevel,
  permissionLevelFromAutonomy,
} from "../src/lib/bot-permission";

describe("per-bot permission", () => {
  it("maps Set Up choices onto the stored autonomy values", () => {
    expect(autonomyFromPermissionLevel("full")).toBe("auto");
    expect(autonomyFromPermissionLevel("auto")).toBe("supervised");
    expect(autonomyFromPermissionLevel("ask")).toBe("draft");
    expect(permissionLevelFromAutonomy("auto")).toBe("full");
    expect(permissionLevelFromAutonomy("supervised")).toBe("auto");
    expect(permissionLevelFromAutonomy("draft")).toBe("ask");
    expect(permissionLevelFromAutonomy("inherit")).toBe("auto");
  });

  it("changes what the action engine executes", () => {
    expect(actionExecutionMode({ agentLevel: "auto", actionType: "send_email" })).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "supervised", actionType: "send_email" })).toBe(
      "draft",
    );
    expect(
      actionExecutionMode({ agentLevel: "supervised", actionType: "create_internal_task" }),
    ).toBe("auto");
    expect(actionExecutionMode({ agentLevel: "draft", actionType: "create_internal_task" })).toBe(
      "draft",
    );
    expect(
      actionExecutionMode({
        agentLevel: "draft",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "automatic",
      }),
    ).toBe("auto");
    expect(
      actionExecutionMode({
        agentLevel: "supervised",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "inherit",
      }),
    ).toBe("auto");
    expect(
      actionExecutionMode({
        agentLevel: "draft",
        actionType: "schedule_calendar",
        nativeCalendarConfigured: true,
        calendarBookingMode: "inherit",
      }),
    ).toBe("draft");
  });

  it("starts a new Bot on Auto", () => {
    for (const file of [
      "src/routes/agent-routes-v2.ts",
      "src/lib/agent-draft-service.ts",
      "src/routes/mobile-routes.ts",
    ]) {
      expect(readFileSync(file, "utf8"), file).toContain('autonomyLevel: "supervised"');
    }
  });
});
