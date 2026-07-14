import { describe, expect, it } from "vitest";
import { workspacePageTitle } from "../src/constants/navigation";

describe("workspacePageTitle", () => {
  it("uses the most specific workspace route label", () => {
    expect(workspacePageTitle("/studio")).toBe("Studio");
    expect(workspacePageTitle("/studio/agent/123")).toBe("Studio");
    expect(workspacePageTitle("/settings/compliance")).toBe("Compliance center");
    expect(workspacePageTitle("/connections/salesforce/")).toBe("Salesforce connection");
  });

  it("falls back honestly for an unknown authenticated route", () => {
    expect(workspacePageTitle("/not-a-real-workspace-route")).toBe("Workspace");
  });
});
