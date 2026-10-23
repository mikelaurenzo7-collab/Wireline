import { describe, expect, it } from "vitest";

import {
  APP_KEYBOARD_SHORTCUTS,
  MOBILE_MORE_GROUPS,
  MOBILE_PRIMARY_NAV,
  OPERATE_NAV,
  PAGE_TITLES,
  WORKSPACE_NAV,
  WORKSPACE_SECTIONS,
  desktopNavParentHref,
  isMobileMoreActive,
  isMobilePrimaryActive,
  isNavActive,
  workspacePageTitle,
  workspaceSectionForPath,
} from "../src/constants/navigation";

describe("BotBound workspace information architecture", () => {
  it("keeps daily desktop work focused and ordered", () => {
    expect(WORKSPACE_NAV.map((item) => item.href)).toEqual([
      "/studio",
      "/inbox",
      "/phone",
      "/calendar",
    ]);
    expect(WORKSPACE_SECTIONS.map((section) => [section.href, section.label])).toEqual([
      ["/studio", "Workspace"],
      ["/knowledge", "Knowledge"],
      ["/computer", "Computer"],
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
    for (const section of ["/knowledge", "/computer"]) {
      expect(desktopNavParentHref(section), section).toBe("/studio");
      expect(
        WORKSPACE_NAV.filter((item) => isNavActive(section, item.href)).map((item) => item.href),
        section,
      ).toEqual(["/studio"]);
    }
    expect(workspaceSectionForPath("/studio")).toBe("setup");
    expect(workspaceSectionForPath("/templates")).toBe("setup");
    expect(workspaceSectionForPath("/knowledge")).toBe("knowledge");
    expect(workspaceSectionForPath("/computer/task-1")).toBe("computer");
    expect(workspaceSectionForPath("/inbox")).toBeNull();
    expect(desktopNavParentHref("/templates")).toBe("/studio");
    expect(desktopNavParentHref("/approvals")).toBe("/inbox");
    expect(desktopNavParentHref("/apps")).toBe("/settings");
    expect(desktopNavParentHref("/settings/compliance")).toBe("/settings");
  });

  it("makes More exclusive for configuration and governance routes", () => {
    expect(isMobileMoreActive("/calendar")).toBe(true);
    expect(isMobileMoreActive("/connections")).toBe(true);
    expect(isMobileMoreActive("/settings/team")).toBe(true);
    expect(isMobileMoreActive("/apps")).toBe(true);

    // Workspace sections and Inbox tabs stay with their dock owner.
    for (const pathname of ["/templates", "/knowledge", "/computer"]) {
      expect(isMobileMoreActive(pathname), pathname).toBe(false);
      expect(isMobilePrimaryActive(pathname, "/studio"), pathname).toBe(true);
    }
    expect(isMobileMoreActive("/approvals")).toBe(false);
    expect(isMobilePrimaryActive("/approvals", "/inbox")).toBe(true);
  });

  it("groups the More sheet by task instead of exposing a flat admin list", () => {
    expect(MOBILE_MORE_GROUPS.map((group) => group.label)).toEqual(["Operate", "System"]);
    expect(MOBILE_MORE_GROUPS.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/calendar"],
      ["/connections", "/settings"],
    ]);
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
