import { describe, expect, it } from "vitest";
import { workspaceFirstName, workspaceSidebarLabel } from "../src/lib/user-display";

describe("user-display", () => {
  it("prefers full_name for greetings", () => {
    expect(workspaceFirstName("Mike Laurenzo", "qa@mailinator.com")).toBe("Mike");
  });

  it("capitalizes lowercase full_name tokens", () => {
    expect(workspaceFirstName("mike laurenzo", "qa@mailinator.com")).toBe("Mike");
    expect(workspaceSidebarLabel("mike laurenzo", "qa@mailinator.com")).toBe("Mike");
  });

  it("cleans noisy QA mailbox locals for greetings", () => {
    expect(workspaceFirstName(null, "visual.qa.1783401139134@mailinator.com")).toBe("Visual");
  });

  it("sanitizes machine-like full_name tokens", () => {
    expect(workspaceFirstName("visual.qa.1783401139134", "ignored@mailinator.com")).toBe("Visual");
    expect(workspaceSidebarLabel("visual.qa.1783401139134", "ignored@mailinator.com")).toBe(
      "Visual",
    );
  });

  it("degrades unfriendly locals to there", () => {
    expect(workspaceFirstName(null, "x@mailinator.com")).toBe("there");
  });

  it("shows a short sidebar label instead of a machine username", () => {
    expect(workspaceSidebarLabel(null, "visual.qa.1783401139134@mailinator.com")).toBe("Visual");
  });

  it("truncates very long display names in the rail", () => {
    expect(workspaceSidebarLabel("abcdefghijklmnopqrstuvwxyz", null)).toBe("Abcdefghijklmnopq…");
  });

  it("uses a custom fallback when identity is unknown", () => {
    expect(workspaceSidebarLabel(null, null, "Workspace owner")).toBe("Workspace owner");
  });
});
