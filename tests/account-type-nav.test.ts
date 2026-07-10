import { describe, expect, it } from "vitest";

import {
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "../src/lib/account-type";

describe("account-type navigation lens", () => {
  it("keeps Phone, Inbox, and Settings for personal Operate", () => {
    const paths = accountSidebarItems("personal").map((item) => item.path);
    expect(paths).toContain("/phone");
    expect(paths).toContain("/inbox");
    expect(paths).toContain("/settings");
    expect(paths).not.toContain("/insights");
    expect(paths).not.toContain("/approvals");
    expect(paths).not.toContain("/apps");
  });

  it("keeps an Operate group for personal with trimmed items", () => {
    const groups = accountNavGroups("personal");
    expect(groups.map((group) => group.label)).toEqual(["Workspace", "Operate"]);
    const operate = groups.find((group) => group.label === "Operate");
    expect(operate?.items.map((item) => item.path)).toEqual(["/phone", "/inbox", "/settings"]);
  });

  it("exposes full Operate for business", () => {
    const paths = accountSidebarItems("business").map((item) => item.path);
    expect(paths).toContain("/insights");
    expect(paths).toContain("/approvals");
    // Apps moved out of top-level Operate into Settings tabs (simplified IA).
    expect(paths).not.toContain("/apps");
  });

  it("gates route availability for personal accounts", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
