/**
 * navigation.test.ts
 * Locks the authenticated app IA: Command, Channels, Agents, Design, Admin.
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES, APP_KEYBOARD_SHORTCUTS, SIDEBAR_NAV_ITEMS } from "./navigation";

describe("Top-bar navigation IA", () => {
  it("ships exactly five logical groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      "Command",
      "Channels",
      "Agents",
      "Design",
      "Admin",
    ]);
  });

  it("desktop rail is a single flat list without Admin footer items", () => {
    expect(SIDEBAR_NAV_ITEMS.map((i) => i.path)).toEqual([
      "/ops",
      "/insights",
      "/pipeline",
      "/phone",
      "/email",
      "/sms",
      "/agents",
      "/chat",
      "/training",
      "/design",
    ]);
    expect(SIDEBAR_NAV_ITEMS.map((i) => i.section)).toEqual([
      "Command",
      "Command",
      "Command",
      "Channels",
      "Channels",
      "Channels",
      "Agents",
      "Agents",
      "Agents",
      "Design",
    ]);
  });

  it("Command group holds the cockpit, intelligence, and pipeline surfaces", () => {
    const command = NAV_GROUPS.find((g) => g.label === "Command")!;
    expect(command.items.map((i) => i.path)).toEqual(["/ops", "/insights", "/pipeline"]);
  });

  it("Channels group has Phone, Email, SMS", () => {
    const channels = NAV_GROUPS.find((g) => g.label === "Channels")!;
    expect(channels.items.map((i) => i.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("Agents group holds fleet management, chat coaching, and training", () => {
    const agents = NAV_GROUPS.find((g) => g.label === "Agents")!;
    expect(agents.items.map((i) => i.path)).toEqual(["/agents", "/chat", "/training"]);
  });

  it("Design is a standalone beta-labelled group", () => {
    const designGroup = NAV_GROUPS.find((g) => g.label === "Design")!;
    expect(designGroup.items.map((i) => i.path)).toEqual(["/design"]);
    const design = designGroup.items[0];
    expect(design.betaLabel).toBe("Beta");
    expect(PAGE_TITLES["/design"]).toBe("Wireline Design");
  });

  it("Admin group keeps Settings in footer-only navigation", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/admin"]);
    expect(SIDEBAR_NAV_ITEMS.map((i) => i.path)).not.toContain("/admin");
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
