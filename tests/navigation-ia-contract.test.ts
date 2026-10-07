import { describe, expect, it } from "vitest";

import {
  APP_KEYBOARD_SHORTCUTS,
  MOBILE_MORE_GROUPS,
  MOBILE_PRIMARY_NAV,
  OPERATE_NAV,
  PAGE_TITLES,
  WORKSPACE_NAV,
  desktopNavParentHref,
  isMobileMoreActive,
  isMobilePrimaryActive,
  isNavActive,
  workspacePageTitle,
} from "../src/constants/navigation";

describe("BotBound workspace information architecture", () => {
  it("keeps daily desktop work focused and ordered", () => {
    expect(WORKSPACE_NAV.map((item) => item.href)).toEqual([
      "/studio",
      "/knowledge",
      "/inbox",
      "/phone",
      "/calendar",
      "/computer",
    ]);
    expect(OPERATE_NAV.map((item) => item.href)).toEqual([
      "/insights",
      "/connections",
      "/settings",
    ]);
  });

  it("gives mobile one clear owner for every route", () => {
    expect(MOBILE_PRIMARY_NAV.map((item) => item.href)).toEqual([
      "/studio",
      "/inbox",
      "/phone",
      "/insights",
      "__more__",
    ]);

    for (const pathname of [
      "/studio",
      "/studio/handoff",
      "/templates",
      "/knowledge",
      "/inbox",
      "/approvals",
      "/phone",
      "/insights",
      "/connections",
      "/settings/billing",
      "/apps",
    ]) {
      const active = MOBILE_PRIMARY_NAV.filter((item) =>
        isMobilePrimaryActive(pathname, item.href),
      );
      expect(active, pathname).toHaveLength(1);
    }
  });

  it("keeps contextual children under their natural parent", () => {
    expect(desktopNavParentHref("/knowledge")).toBeNull();
    expect(
      WORKSPACE_NAV.filter((item) => isNavActive("/knowledge", item.href)).map((item) => item.href),
    ).toEqual(["/knowledge"]);
    expect(desktopNavParentHref("/templates")).toBe("/studio");
    expect(desktopNavParentHref("/approvals")).toBe("/inbox");
    expect(desktopNavParentHref("/apps")).toBe("/settings");
    expect(desktopNavParentHref("/settings/compliance")).toBe("/settings");
  });

  it("makes More exclusive for configuration and governance routes", () => {
    expect(isMobileMoreActive("/knowledge")).toBe(true);
    expect(isMobileMoreActive("/approvals")).toBe(true);
    expect(isMobileMoreActive("/calendar")).toBe(true);
    expect(isMobileMoreActive("/computer")).toBe(true);
    expect(isMobileMoreActive("/connections")).toBe(true);
    expect(isMobileMoreActive("/settings/team")).toBe(true);
    expect(isMobileMoreActive("/apps")).toBe(true);

    expect(isMobileMoreActive("/templates")).toBe(false);
    expect(isMobilePrimaryActive("/templates", "/studio")).toBe(true);
    expect(isMobilePrimaryActive("/knowledge", "/studio")).toBe(false);
  });

  it("groups the More sheet by task instead of exposing a flat admin list", () => {
    expect(MOBILE_MORE_GROUPS.map((group) => group.label)).toEqual(["Build", "Operate", "System"]);
    expect(MOBILE_MORE_GROUPS.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/knowledge"],
      ["/calendar", "/computer", "/approvals"],
      ["/connections", "/settings"],
    ]);
  });

  it("keeps deep page titles and intuitive keyboard ownership", () => {
    expect(PAGE_TITLES["/overview"]).toBe("Bot Studio");
    expect(PAGE_TITLES["/agents"]).toBe("Bot Studio");
    expect(workspacePageTitle("/studio/handoff/session-1")).toBe("Browser Handoff");
    expect(workspacePageTitle("/settings/billing/invoices")).toBe("Billing Settings");
    expect(workspacePageTitle("/connections/salesforce/setup")).toBe("Salesforce Connection");

    expect(APP_KEYBOARD_SHORTCUTS).toMatchObject({
      S: "/studio",
      I: "/inbox",
      P: "/phone",
      C: "/calendar",
      M: "/computer",
      A: "/studio",
      W: "/connections",
      T: "/knowledge",
      G: "/settings",
    });
  });
});
