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

  it("keeps a Work group for personal with trimmed items", () => {
    const groups = accountNavGroups("personal");
    expect(groups.map((group) => group.label)).toEqual(["Set up", "Work"]);
    const work = groups.find((group) => group.label === "Work");
    expect(work?.items.map((item) => item.path)).toEqual(["/inbox", "/phone", "/settings"]);
  });

  it("exposes the simplified top-level Work destinations for business", () => {
    const paths = accountSidebarItems("business").map((item) => item.path);
    expect(paths).toContain("/insights");
    // Approvals remains route-available but is reached contextually / from More.
    expect(paths).not.toContain("/approvals");
    expect(isRouteAvailableForAccount("business", "/approvals")).toBe(true);
    // Apps moved out of top-level Work into Settings tabs (simplified IA).
    expect(paths).not.toContain("/apps");
  });

  it("gates route availability for personal accounts", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
