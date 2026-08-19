import { describe, expect, it } from "vitest";

import {
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "../src/lib/account-type";
import { MOBILE_MORE_NAV } from "../src/constants/navigation";

describe("account-type navigation lens", () => {
  it("offers the full workspace to every account", () => {
    for (const type of ["personal", "business"] as const) {
      const paths = accountSidebarItems(type).map((item) => item.path);
      expect(paths).toContain("/phone");
      expect(paths).toContain("/inbox");
      expect(paths).toContain("/settings");
      expect(paths).toContain("/insights");
      expect(paths).not.toContain("/approvals");
      expect(paths).not.toContain("/apps");
    }
    expect(MOBILE_MORE_NAV.map((item) => item.href)).toContain("/approvals");
  });

  it("keeps Set up and Work groups with Insights on Work", () => {
    const groups = accountNavGroups("personal");
    expect(groups.map((group) => group.label)).toEqual(["Set up", "Work"]);
    const work = groups.find((group) => group.label === "Work");
    expect(work?.items.map((item) => item.path)).toContain("/insights");
    expect(work?.items.map((item) => item.path)).toContain("/inbox");
    expect(work?.items.map((item) => item.path)).toContain("/phone");
    expect(work?.items.map((item) => item.path)).toContain("/settings");
  });

  it("does not hide Activity for a stored personal account", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(true);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
