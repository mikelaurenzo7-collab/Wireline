import { describe, expect, it } from "vitest";

import {
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "../src/lib/account-type";
import { MOBILE_MORE_NAV } from "../src/constants/navigation";

describe("legacy account-type navigation compatibility", () => {
  it("keeps the complete Bot workspace for both stored account values", () => {
    const legacyPersonalPaths = accountSidebarItems("personal").map((item) => item.path);
    const legacyBusinessPaths = accountSidebarItems("business").map((item) => item.path);
    expect(legacyPersonalPaths).toEqual(legacyBusinessPaths);
    const paths = legacyPersonalPaths;
    expect(paths).toContain("/studio");
    expect(paths).toContain("/inbox");
    expect(paths).toContain("/phone");
    expect(paths).toContain("/calendar");
    expect(paths).toContain("/connections");
    expect(paths).toContain("/settings");
    expect(paths).toContain("/insights");
  });

  it("preserves the same Work / Manage IA for both compatibility values", () => {
    const groups = accountNavGroups("personal");
    expect(groups).toEqual(accountNavGroups("business"));
    expect(groups.map((group) => group.label)).toEqual(["Work", "Manage"]);
    // Knowledge and Computer are Workspace sections, reached from /studio.
    expect(groups.find((group) => group.label === "Work")?.items.map((item) => item.path)).toEqual([
      "/studio",
      "/inbox",
      "/phone",
      "/calendar",
    ]);
    expect(
      groups.find((group) => group.label === "Manage")?.items.map((item) => item.path),
    ).toEqual(["/insights", "/connections", "/settings"]);
  });

  it("keeps secondary tools out of the primary rail", () => {
    const paths = accountSidebarItems("personal").map((item) => item.path);
    expect(paths).not.toContain("/approvals");
    expect(paths).not.toContain("/apps");
    expect(paths).not.toContain("/knowledge");
    expect(paths).not.toContain("/computer");
    // Approvals is an Inbox tab, so More carries only calendar and system routes.
    expect(MOBILE_MORE_NAV.map((item) => item.href)).toEqual([
      "/calendar",
      "/connections",
      "/settings",
    ]);
  });

  it("does not branch route availability by a legacy account value", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/studio")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/connections")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
