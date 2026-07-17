import { describe, expect, it } from "vitest";

import {
  accountNavGroups,
  accountSidebarItems,
  isRouteAvailableForAccount,
} from "../src/lib/account-type";
import { MOBILE_MORE_NAV } from "../src/constants/navigation";

describe("account-type navigation lens", () => {
  it("keeps Calls, Inbox, and Settings for personal Work", () => {
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

  it("exposes full Work for business", () => {
    const paths = accountSidebarItems("business").map((item) => item.path);
    expect(paths).toContain("/insights");
    // Approvals moved off the primary rail into the mobile More sheet and
    // contextual links (Overview follow-ups); Apps lives in Settings tabs.
    expect(paths).not.toContain("/approvals");
    expect(paths).not.toContain("/apps");
    expect(MOBILE_MORE_NAV.map((item) => item.href)).toContain("/approvals");
  });

  it("gates route availability for personal accounts", () => {
    expect(isRouteAvailableForAccount("personal", "/insights")).toBe(false);
    expect(isRouteAvailableForAccount("personal", "/phone")).toBe(true);
    expect(isRouteAvailableForAccount("business", "/insights")).toBe(true);
  });
});
