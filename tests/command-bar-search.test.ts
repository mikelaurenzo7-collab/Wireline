import { describe, expect, it } from "vitest";
import { searchWorkspaceCommands } from "../src/components/CommandBar";

describe("workspace command discovery", () => {
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
