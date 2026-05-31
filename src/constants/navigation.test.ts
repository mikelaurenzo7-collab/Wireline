/**
 * Top-bar navigation IA contracts — locked after Live Ops merge
 * and Activity consolidation. These tests verify structural nav
 * integrity.
 */
import { describe, expect, it } from "vitest";
import { NAV_GROUPS, PAGE_TITLES, APP_KEYBOARD_SHORTCUTS } from "./navigation";

describe("navigation structure", () => {
  it("ships exactly four groups in the documented order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Workspace", "Channels", "Sales", "Admin"]);
  });

  it("every group has at least one item", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every nav item has a unique path", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("every nav item has a PAGE_TITLES entry", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(PAGE_TITLES[item.path], `missing title for ${item.path}`).toBeDefined();
      }
    }
  });

  it("every nav item has a valid icon component", () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.icon).toBeDefined();
      }
    }
  });

  it("keyboard shortcuts align with primary nav paths", () => {
    expect(APP_KEYBOARD_SHORTCUTS.R).toBe("/chat");
    expect(APP_KEYBOARD_SHORTCUTS.N).toBe("/training");
    expect(APP_KEYBOARD_SHORTCUTS.D).toBe("/ops");
    expect(APP_KEYBOARD_SHORTCUTS.T).toBe("/triage");
    expect(APP_KEYBOARD_SHORTCUTS.I).toBe("/insights");
    expect(APP_KEYBOARD_SHORTCUTS.P).toBe("/phone");
    expect(APP_KEYBOARD_SHORTCUTS.E).toBe("/email");
    expect(APP_KEYBOARD_SHORTCUTS.M).toBe("/sms");
    expect(APP_KEYBOARD_SHORTCUTS.A).toBe("/agents");
    expect(APP_KEYBOARD_SHORTCUTS.S).toBe("/admin");
  });
});

describe("nav group item paths", () => {
  it("Workspace group contains expected navigation paths", () => {
    const ws = NAV_GROUPS.find((g) => g.label === "Workspace")!;
    expect(ws.items.map((i) => i.path)).toEqual(["/chat", "/training", "/ops", "/triage", "/insights"]);
  });

  it("Channels group has Phone, Email, SMS", () => {
    const ch = NAV_GROUPS.find((g) => g.label === "Channels")!;
    expect(ch.items.map((i) => i.path)).toEqual(["/phone", "/email", "/sms"]);
  });

  it("Sales group has Pipeline only", () => {
    const sales = NAV_GROUPS.find((g) => g.label === "Sales")!;
    expect(sales.items.map((i) => i.path)).toEqual(["/pipeline"]);
  });

  it("Admin group has Agents and Settings as separate items", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    expect(admin.items.map((i) => i.path)).toEqual(["/agents", "/admin"]);
  });

  it("Settings does not match /agents", () => {
    const admin = NAV_GROUPS.find((g) => g.label === "Admin")!;
    const settings = admin.items.find((i) => i.path === "/admin")!;
    expect(settings.matches).not.toContain("/agents");
  });
});

describe("route matches", () => {
  it("Phone matches legacy activity, appointments, logs, outbound routes", () => {
    const phone = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/phone")!;
    expect(phone.matches).toEqual(
      expect.arrayContaining(["/activity", "/appointments", "/logs", "/outbound"]),
    );
  });

  it("Live Ops matches legacy dashboard, command, live, cockpit routes", () => {
    const ops = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/ops")!;
    expect(ops.matches).toEqual(
      expect.arrayContaining(["/dashboard", "/command", "/live", "/cockpit"]),
    );
  });

  it("Training matches legacy /knowledge route", () => {
    const training = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === "/training")!;
    expect(training.matches).toContain("/knowledge");
  });

  it("Activity is not a separate sidebar item", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(paths).not.toContain("/activity");
  });

  it("Cockpit is not a separate sidebar item", () => {
    const paths = NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path);
    expect(paths).not.toContain("/cockpit");
  });
});

describe("page titles", () => {
  it("all PAGE_TITLES have non-empty string values", () => {
    for (const [path, title] of Object.entries(PAGE_TITLES)) {
      expect(typeof title).toBe("string");
      expect(title.length).toBeGreaterThan(0);
    }
  });

  it("every APP_KEYBOARD_SHORTCUTS destination has a PAGE_TITLES entry", () => {
    for (const [key, path] of Object.entries(APP_KEYBOARD_SHORTCUTS)) {
      expect(PAGE_TITLES[path], `shortcut ${key} \u2192 ${path} missing title`).toBeDefined();
    }
  });
});