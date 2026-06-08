/**
 * navigation.test.ts
 * Lock navigation IA after Live Ops merge + Activity consolidation.
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES, APP_KEYBOARD_SHORTCUTS, SIDEBAR_NAV_ITEMS } from "./navigation";

describe("Top-bar navigation IA", () => {
  it("ships exactly four logical groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Workspace", "Channels", "Sales", "Admin"]);
  });

  it("desktop rail is a single flat list without Settings (footer only)", () => {
    expect(SIDEBAR_NAV_ITEMS.map((i) => i.path)).toEqual([
      "/ops",
      "/chat",
      "/training",
      "/insights",
      "/phone",
      "/email",
      "/sms",
      "/pipeline",
      "/agents",
    ]);
    expect(SIDEBAR_NAV_ITEMS.map((i) => i.section)).toEqual([
      "Workspace",
      "Workspace",
      "Workspace",
      "Workspace",
      "Channels",
      "Channels",
      "Channels",
      "Sales",
      "Fleet",
    ]);
  });

  it("Workspace group: Live Ops first, then Chat, Training, Insights (Triage is an Ops tab)", () => {
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toEqual(["/ops", "/chat", "/training", "/insights"]);
  });

  it("Channels group has Phone, Email, SMS", () => {
    const ch = NAV_GROUPS.find((g) => g.label === "Channels")!;
    expect(ch.items.map((i) => i.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("Phone matches legacy activity and appointments routes", () => {
    const phone = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/phone")!;
    expect(phone.matches).toEqual(
      expect.arrayContaining(["/activity", "/appointments", "/logs", "/outbound"]),
    );
  });

  it("Activity is not a separate sidebar item (history lives under Phone)", () => {
    const paths = SIDEBAR_NAV_ITEMS.map((i) => i.path);
    expect(paths).not.toContain("/activity");
  });

  it("Live Ops matches legacy dashboard, cockpit, and triage routes", () => {
    const ops = SIDEBAR_NAV_ITEMS.find((i) => i.path === "/ops")!;
    expect(ops.matches).toEqual(
      expect.arrayContaining(["/dashboard", "/command", "/live", "/cockpit", "/triage"]),
    );
  });

  it("Triage is not a separate sidebar item (merged into Live Ops)", () => {
    const paths = SIDEBAR_NAV_ITEMS.map((i) => i.path);
    expect(paths).not.toContain("/triage");
  });

  it("Training matches legacy /knowledge route", () => {
    const training = SIDEBAR_NAV_ITEMS.find((i) => i.path === "/training")!;
    expect(training.matches).toContain("/knowledge");
  });

  it("Cockpit is not a separate sidebar item (merged into Live Ops)", () => {
    const paths = SIDEBAR_NAV_ITEMS.map((i) => i.path);
    expect(paths).not.toContain("/cockpit");
  });

  it("keyboard shortcuts align with primary nav paths", () => {
    expect(APP_KEYBOARD_SHORTCUTS.D).toBe("/ops");
    expect(APP_KEYBOARD_SHORTCUTS.T).toBe("/ops?tab=triage");
    expect(APP_KEYBOARD_SHORTCUTS.N).toBe("/training");
    expect(APP_KEYBOARD_SHORTCUTS.P).toBe("/phone");
  });

  it("Sales group has Pipeline only", () => {
    const sales = NAV_GROUPS.find((g) => g.label === "Sales")!;
    expect(sales.items.map((i) => i.path)).toEqual(["/pipeline"]);
  });

  it("Admin group has Agents and Settings as separate items", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/agents", "/admin"]);
    const settings = admin.items.find((i) => i.path === "/admin")!;
    expect(settings.matches).not.toContain("/agents");
  });

  it("every nav item has a PAGE_TITLES entry", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(PAGE_TITLES[item.path], `missing title for ${item.path}`).toBeDefined();
      }
    }
  });

  it("no two nav items share the same path", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
