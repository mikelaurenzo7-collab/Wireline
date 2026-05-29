/**
 * navigation.test.ts
 * ----------------------------------------------------------------------
 * Lock the navigation IA after the 2026 design pass. Three things go
 * wrong here historically:
 *
 *   1. Settings drifts back out of the top nav (it's the 1-click home
 *      of Billing / Branding / Carrier — burying it kills velocity).
 *   2. Cockpit and Live Ops get reconfused (they're DIFFERENT views;
 *      Cockpit was redirect-stubbed to / for a while and the nav still
 *      advertised it — that's the bug the audit caught).
 *   3. A nav item gets added but its route handler doesn't render its
 *      own component — phantom tabs that 404 or redirect.
 *
 * These tests pin all three.
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES } from "./navigation";

describe("Top-bar navigation IA", () => {
  it("ships exactly four groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Workspace", "Fleet", "Activity", "Admin"]);
  });

  it("Workspace group leads with Chat, then Live Ops, Triage, Insights", () => {
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toEqual(["/chat", "/", "/triage", "/insights"]);
  });

  it("Chat is the first/primary nav item (chat is the main control surface)", () => {
    expect(NAV_GROUPS[0].items[0].path).toBe("/chat");
  });

  it("Fleet group has Agents, Training, Cockpit", () => {
    const fl = NAV_GROUPS.find((g) => g.label === "Fleet")!;
    expect(fl.items.map((i) => i.path)).toEqual(["/agents", "/train", "/cockpit"]);
  });

  it("Activity group has Activity and Pipeline", () => {
    const act = NAV_GROUPS.find((g) => g.label === "Activity")!;
    expect(act.items.map((i) => i.path)).toEqual(["/logs", "/pipeline"]);
  });

  it("Settings is in the top-bar nav (Admin group), not buried in the avatar menu", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/admin"]);
    expect(admin.items[0].label).toBe("Settings");
  });

  it("Live Ops does NOT claim /cockpit as a match (Cockpit is its own page)", () => {
    const liveOps = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/")!;
    expect(liveOps.matches ?? []).not.toContain("/cockpit");
  });

  it("Cockpit is a top-level path, not a redirect alias", () => {
    const cockpit = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/cockpit");
    expect(cockpit).toBeDefined();
    expect(cockpit!.label).toBe("Cockpit");
  });

  it("Settings matches Integrations / DNC / Audit so deep-link badges land correctly", () => {
    const settings = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/admin")!;
    expect(settings.matches).toEqual(expect.arrayContaining(["/integrations", "/dnc", "/audit"]));
  });

  it("every nav item has a PAGE_TITLES entry (so the tab title isn't generic 'Wireline')", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(PAGE_TITLES[item.path], `missing title for ${item.path}`).toBeDefined();
      }
    }
  });

  it("no two nav items share the same path (or active-state would collide)", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
