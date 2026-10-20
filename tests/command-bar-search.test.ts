import { describe, expect, it } from "vitest";
import { searchWorkspaceCommands, workspaceCommandHref } from "../src/components/CommandBar";

describe("workspace command discovery", () => {
  it("preserves the selected Bot for workspace navigation without scoping account actions", () => {
    expect(workspaceCommandHref("/computer", "bot/a")).toBe("/computer?agent=bot%2Fa");
    expect(workspaceCommandHref("/knowledge", "bot-b")).toBe("/knowledge?agent=bot-b");
    expect(workspaceCommandHref("/studio", "bot-b")).toBe("/studio?agent=bot-b");
    expect(workspaceCommandHref("/computer", null)).toBe("/computer");
    expect(workspaceCommandHref("/studio?create=1", "bot-b")).toBe("/studio?create=1");
    expect(workspaceCommandHref("/settings/billing", "bot-b")).toBe("/settings/billing");
  });

  it.each(["knowledge", "rules", "memory", "training"])(
    "finds editable knowledge for %s",
    (query) => {
      expect(searchWorkspaceCommands(query).map((command) => command.href)).toContain("/knowledge");
    },
  );

  it.each(["Calendar", "appointments", "availability", "bookings"])(
    "routes %s to Calendar",
    (query) => {
      expect(searchWorkspaceCommands(query).map((command) => command.href)).toEqual(["/calendar"]);
    },
  );

  it("keeps Calls discoverable without claiming appointment ownership", () => {
    expect(searchWorkspaceCommands("calls").map((command) => command.href)).toEqual(["/phone"]);
    expect(searchWorkspaceCommands("sms")).toEqual([]);
    expect(searchWorkspaceCommands("campaign")).toEqual([]);
    expect(searchWorkspaceCommands("lead hunt")).toEqual([]);
    expect(searchWorkspaceCommands("appointments").map((command) => command.href)).not.toContain(
      "/phone",
    );
    expect(searchWorkspaceCommands("   ").map((command) => command.href)).toContain("/calendar");
  });
});
