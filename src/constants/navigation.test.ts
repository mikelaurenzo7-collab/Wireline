/**
 * navigation.test.ts
 * ----------------------------------------------------------------------
 * Lock the radically-simplified, chat-centric navigation IA. After the
 * chat pivot the rail carries only the handful of surfaces operators reach
 * for directly; everything else is reachable from the Director's
 * mission-control dock + direct links. These tests pin the invariants that
 * historically regressed:
 *
 *   1. Chat stays the first/primary item (it's the product).
 *   2. Settings stays in the rail (1-click home of Billing / Branding /
 *      Carrier / Agents) — never buried in a dropdown.
 *   3. Integrations is its own first-class item (connecting channels is a
 *      core, frequent task).
 *   4. Training never gets a standalone nav item — it's folded into chat.
 *   5. Every nav item has a real PAGE_TITLES entry + a unique path.
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES } from "./navigation";

describe("Navigation IA (chat-centric, simplified)", () => {
  it("ships exactly two groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Workspace", "Admin"]);
  });

  it("Workspace group is Chat then Call Logs", () => {
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toEqual(["/chat", "/logs"]);
  });

  it("Chat is the first/primary nav item (chat is the main control surface)", () => {
    expect(NAV_GROUPS[0].items[0].path).toBe("/chat");
  });

  it("Admin group is Integrations then Settings", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/integrations", "/admin"]);
    expect(admin.items.map((i) => i.label)).toEqual(["Integrations", "Settings"]);
  });

  it("the rail stays lean — at most 4 primary destinations", () => {
    const count = NAV_GROUPS.flatMap((g) => g.items).length;
    expect(count).toBeLessThanOrEqual(4);
  });

  it("Training is folded into chat — no standalone /train or /knowledge nav item", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(paths).not.toContain("/train");
    expect(paths).not.toContain("/knowledge");
  });

  it("Settings owns its sub-pages (DNC / Audit / Agents) for deep-link active state", () => {
    const settings = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/admin")!;
    expect(settings.matches).toEqual(expect.arrayContaining(["/dnc", "/audit", "/agents"]));
  });

  it("Integrations is its own item, not just a Settings sub-match", () => {
    const integrations = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/integrations");
    expect(integrations).toBeDefined();
    // ...and Settings no longer claims /integrations (would collide active state).
    const settings = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/admin")!;
    expect(settings.matches ?? []).not.toContain("/integrations");
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
