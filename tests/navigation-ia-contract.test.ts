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
  scopedWorkspaceHref,
  workspacePageTitle,
} from "../src/constants/navigation";

describe("BotBound workspace information architecture", () => {
  it("keeps daily desktop work focused and ordered", () => {
    expect(WORKSPACE_NAV.map((item) => item.href)).toEqual([
      "/studio",
      "/inbox",
      "/phone",
      "/calendar",
    ]);
    expect(OPERATE_NAV.map((item) => item.href)).toEqual([
      "/knowledge",
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
      "/knowledge",
      "__more__",
    ]);

    for (const pathname of [
      "/studio",
      "/studio/handoff",
      "/computer",
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
    for (const section of ["/knowledge"]) {
      expect(desktopNavParentHref(section), section).toBeNull();
      expect(
        [...WORKSPACE_NAV, ...OPERATE_NAV]
          .filter((item) => isNavActive(section, item.href))
          .map((item) => item.href),
        section,
      ).toEqual([section]);
    }
    expect(desktopNavParentHref("/templates")).toBe("/studio");
    expect(desktopNavParentHref("/computer")).toBe("/studio");
    expect(isNavActive("/computer", "/computer")).toBe(true);
    expect(isNavActive("/computer", "/studio")).toBe(true);
    expect(desktopNavParentHref("/approvals")).toBe("/inbox");
    expect(desktopNavParentHref("/apps")).toBe("/settings");
    expect(desktopNavParentHref("/settings/compliance")).toBe("/settings");
  });

  it("makes More exclusive for configuration and governance routes", () => {
    expect(isMobileMoreActive("/calendar")).toBe(true);
    expect(isMobileMoreActive("/connections")).toBe(true);
    expect(isMobileMoreActive("/settings/team")).toBe(true);
    expect(isMobileMoreActive("/apps")).toBe(true);

    for (const pathname of ["/insights"]) {
      expect(isMobileMoreActive(pathname), pathname).toBe(true);
      expect(isMobilePrimaryActive(pathname, "/studio"), pathname).toBe(false);
    }
    expect(isMobileMoreActive("/knowledge")).toBe(false);
    expect(isMobilePrimaryActive("/knowledge", "/knowledge")).toBe(true);
    expect(isMobilePrimaryActive("/templates", "/studio")).toBe(true);
    expect(isMobilePrimaryActive("/computer", "/studio")).toBe(true);
    expect(isMobileMoreActive("/computer")).toBe(false);
    expect(isMobileMoreActive("/approvals")).toBe(false);
    expect(isMobilePrimaryActive("/approvals", "/inbox")).toBe(true);
  });

  it("groups the More sheet by task instead of exposing a flat admin list", () => {
    expect(MOBILE_MORE_GROUPS.map((group) => group.label)).toEqual(["Operate", "System"]);
    expect(MOBILE_MORE_GROUPS.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/calendar", "/insights"],
      ["/connections", "/settings"],
    ]);
  });

  it("preserves explicit Bot scope without narrowing account-wide destinations", () => {
    for (const href of ["/studio", "/knowledge"]) {
      expect(scopedWorkspaceHref(href, "missing/bot")).toBe(`${href}?agent=missing%2Fbot`);
      expect(scopedWorkspaceHref(href, " ")).toBe(href);
    }
    expect(scopedWorkspaceHref("/inbox", "bot-a")).toBe("/inbox");
    expect(scopedWorkspaceHref("/phone", "bot-a")).toBe("/phone");
    expect(scopedWorkspaceHref("/computer", "missing/bot")).toBe(
      "/studio?panel=computer&agent=missing%2Fbot",
    );
    expect(scopedWorkspaceHref("/computer", " ")).toBe("/studio?panel=computer");
  });

  it("keeps deep page titles and intuitive keyboard ownership", () => {
    expect(PAGE_TITLES["/overview"]).toBe("Workspace");
    expect(PAGE_TITLES["/agents"]).toBe("Workspace");
    expect(PAGE_TITLES["/workspace"]).toBe("Workspace");
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
