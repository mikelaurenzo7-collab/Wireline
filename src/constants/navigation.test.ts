/**
 * navigation.test.ts
 * ----------------------------------------------------------------------
 * Lock the navigation IA after the 2026 design pass. Four groups:
 * Workspace, Channels, Activity, Admin.
 *
 * Key invariants:
 *   1. Chat remains the primary control surface (first item).
 *   2. Training has its own dedicated sidebar slot.
 *   3. Phone, Email, SMS each get their own Channels slot.
 *   4. Cockpit and Live Ops remain distinct pages.
 *   5. Settings stays visible in the top nav (not buried).
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES } from "./navigation";

describe("Top-bar navigation IA", () => {
  it("ships exactly four groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Workspace", "Channels", "Activity", "Admin"]);
  });

  it("Workspace group leads with Chat, Training, then Live Ops, Triage, Insights, Cockpit", () => {
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toEqual([
      "/chat",
      "/training",
      "/ops",
      "/triage",
      "/insights",
      "/cockpit",
    ]);
  });

  it("Chat is the first/primary nav item (chat is the main control surface)", () => {
    expect(NAV_GROUPS[0].items[0].path).toBe("/chat");
  });

  it("Training is its own dedicated sidebar page", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(paths).toContain("/training");
    expect(paths).not.toContain("/train");
  });

  it("Channels group has Phone, Email, SMS as dedicated pages", () => {
    const ch = NAV_GROUPS.find((g) => g.label === "Channels")!;
    expect(ch.items.map((i) => i.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("Cockpit lives in the Workspace group (Fleet group retired)", () => {
    expect(NAV_GROUPS.map((g) => g.label)).not.toContain("Fleet");
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toContain("/cockpit");
  });

  it("Activity group has Activity and Pipeline", () => {
    const act = NAV_GROUPS.find((g) => g.label === "Activity")!;
    expect(act.items.map((i) => i.path)).toEqual(["/activity", "/pipeline"]);
  });

  it("Settings is in the top-bar nav (Admin group), not buried in the avatar menu", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/admin"]);
    expect(admin.items[0].label).toBe("Settings");
  });

  it("Live Ops does NOT claim /cockpit as a match (Cockpit is its own page)", () => {
    const liveOps = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/ops")!;
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
