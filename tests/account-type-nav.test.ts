import { describe, expect, it } from "vitest";

import {
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "../src/lib/account-type";
import { MOBILE_MORE_NAV } from "../src/constants/navigation";

describe("account-type navigation lens", () => {
  it("keeps the core Bot workspace and setup destinations for personal accounts", () => {
    const paths = accountSidebarItems("personal").map((item) => item.path);
    expect(paths).toContain("/studio");
    expect(paths).toContain("/inbox");
    expect(paths).toContain("/phone");
    expect(paths).toContain("/connections");
    expect(paths).toContain("/settings");
    expect(paths).not.toContain("/insights");
  });

  it("preserves the shared Work / Manage IA while trimming personal-only visibility", () => {
    const groups = accountNavGroups("personal");
    expect(groups.map((group) => group.label)).toEqual(["Work", "Manage"]);
    expect(groups.find((group) => group.label === "Work")?.items.map((item) => item.path)).toEqual([
      "/studio",
      "/inbox",
      "/phone",
    ]);
    expect(groups.find((group) => group.label === "Manage")?.items.map((item) => item.path)).toEqual([
      "/connections",
      "/settings",
    ]);
  });

  it("exposes Activity for business without promoting approvals into the primary rail", () => {
    const paths = accountSidebarItems("business").map((item) => item.path);
    expect(paths).toContain("/insights");
    expect(paths).not.toContain("/approvals");
    expect(paths).not.toContain("/apps");
    expect(MOBILE_MORE_NAV.map((item) => item.href)).toContain("/approvals");
  });

  it("gates Activity for personal while retaining core workspace routes", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/studio")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/connections")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
