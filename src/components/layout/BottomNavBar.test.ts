/**
 * BottomNavBar.test.ts
 * ----------------------------------------------------------------------
 * Locks the mobile primary-4 nav contract. Two historical regressions
 * this pins:
 *
 *   1. Live Ops's `matches` claiming /cockpit (made the bottom bar
 *      light up "Live Ops" when the user was actually on /cockpit —
 *      a viewport-inconsistency bug).
 *   2. Drift between mobile primary tabs and the desktop sidebar IA
 *      (we want different ITEMS per viewport, but the items we DO
 *      ship on both must agree on paths + labels).
 *
 * Note: we test the constant array directly (not a render) — the
 * BottomNavBar component itself uses react-router which needs jsdom +
 * a Router wrapper, and the data shape is the real contract here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { NAV_GROUPS } from "../../constants/navigation";

// The PRIMARY_TABS constant isn't exported (it's internal to the file)
// so we read the source and parse the four labels + paths. This is
// brittle by design — it forces a deliberate test edit if you ever
// add/remove a primary tab.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, "BottomNavBar.tsx"), "utf8");

function extractPrimaryTabs(): { label: string; path: string; matches: string[] }[] {
  const block = /const PRIMARY_TABS[^=]+=\s*\[([\s\S]*?)\];/m.exec(source);
  if (!block) throw new Error("Could not locate PRIMARY_TABS in BottomNavBar.tsx");
  const entries = [...block[1].matchAll(/\{[\s\S]*?\}/g)].map((m) => m[0]);
  return entries.map((entry) => {
    const label = /label:\s*"([^"]+)"/.exec(entry)?.[1] ?? "";
    const path = /path:\s*"([^"]+)"/.exec(entry)?.[1] ?? "";
    const matchesRaw = /matches:\s*\[([^\]]*)\]/.exec(entry)?.[1] ?? "";
    const matches = [...matchesRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    return { label, path, matches };
  });
}

describe("Mobile primary nav (BottomNavBar)", () => {
  const tabs = extractPrimaryTabs();

  it("ships exactly four primary tabs (More is the 5th)", () => {
    expect(tabs).toHaveLength(4);
  });

  it("the four primary tabs are Live Ops, Triage, Activity, Cockpit (in this order)", () => {
    expect(tabs.map((t) => t.label)).toEqual(["Live Ops", "Triage", "Activity", "Cockpit"]);
  });

  it("Live Ops does NOT claim /cockpit as a match (it's its own destination now)", () => {
    const liveOps = tabs.find((t) => t.path === "/ops")!;
    expect(liveOps.matches).not.toContain("/cockpit");
  });

  it("every primary tab's path also exists in the desktop NAV_GROUPS (e2e consistency)", () => {
    const desktopPaths = new Set(NAV_GROUPS.flatMap((g) => g.items).map((i) => i.path));
    for (const tab of tabs) {
      expect(
        desktopPaths.has(tab.path),
        `mobile tab "${tab.label}" → ${tab.path} missing on desktop`,
      ).toBe(true);
    }
  });
});
