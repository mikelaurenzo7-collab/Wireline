import { describe, expect, it } from "vitest";
import { workspaceFirstName, workspaceSidebarLabel } from "../src/lib/user-display";

describe("user-display", () => {
  it("prefers full_name for greetings", () => {
    expect(workspaceFirstName("Mike Laurenzo", "qa@mailinator.com")).toBe("Mike");
  });

  it("cleans noisy QA mailbox locals for greetings", () => {
    expect(workspaceFirstName(null, "visual.qa.1783401139134@mailinator.com")).toBe("Visual");
  });

  it("degrades unfriendly locals to there", () => {
    expect(workspaceFirstName(null, "x@mailinator.com")).toBe("there");
  });

  it("shows a short sidebar label instead of a machine username", () => {
    expect(workspaceSidebarLabel(null, "visual.qa.1783401139134@mailinator.com")).toBe("Visual");
  });

  it("truncates very long display names in the rail", () => {
    expect(workspaceSidebarLabel("abcdefghijklmnopqrstuvwxyz", null)).toBe("abcdefghijklmnopq…");
  });
});
