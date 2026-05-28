import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The /founder surface is intentionally NOT linked from any chrome that
// clients see. Server-side endpoints are gated by OWNER_EMAIL via
// authorizeMigration. These source-text guards keep the client surface
// clean if anyone later re-adds a "Founder" link out of muscle memory.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDEBAR = readFileSync(join(__dirname, "layout", "Sidebar.tsx"), "utf8");
const TOPBAR = readFileSync(join(__dirname, "layout", "TopBar.tsx"), "utf8");
const APP_ROUTES = readFileSync(join(__dirname, "..", "routes", "AppRoutes.tsx"), "utf8");
const NAV_CONSTANTS = readFileSync(join(__dirname, "..", "constants", "navigation.ts"), "utf8");
const APP = readFileSync(join(__dirname, "..", "App.tsx"), "utf8");
const FOUNDER = readFileSync(join(__dirname, "FounderDashboard.tsx"), "utf8");

describe("Founder surface — isolated from the authenticated client app", () => {
  it("Sidebar has no Link / FooterItem pointing at /founder", () => {
    expect(SIDEBAR).not.toMatch(/to=["']\/founder["']/);
  });

  it("TopBar (and avatar dropdown) has no Link pointing at /founder", () => {
    expect(TOPBAR).not.toMatch(/to=["']\/founder["']/);
  });

  it("AppRoutes (authenticated app) does NOT mount /founder", () => {
    // The page is mounted as a public route in App.tsx instead, so the
    // FounderDashboard chunk never preloads into the client AppShell.
    expect(APP_ROUTES).not.toMatch(/path=["']\/founder["']/);
    expect(APP_ROUTES).not.toMatch(/import\([^)]*FounderDashboard/);
  });

  it("navigation constants do NOT reference /founder", () => {
    // PAGE_TITLES / ROUTE_ACCENTS map paths users navigate to inside the
    // app; /founder is intentionally absent.
    expect(NAV_CONSTANTS).not.toMatch(/["']\/founder["']/);
  });

  it("App.tsx mounts /founder as a public route BEFORE the auth guard", () => {
    expect(APP).toMatch(/location\.pathname\s*===\s*["']\/founder["']/);
    expect(APP).toMatch(/<FounderDashboard\s*\/>/);
  });
});

describe("FounderDashboard — auth + owner gates", () => {
  it("renders a quiet placeholder while AuthContext is still hydrating", () => {
    // Without this the owner refreshing /founder briefly hits the
    // anonymous branch and gets punted to /signin — visible jank.
    expect(FOUNDER).toMatch(/authLoading/);
  });

  it("punts anonymous users to /signin with ?redirect=/founder", () => {
    expect(FOUNDER).toMatch(/Navigate\s+to=["']\/signin\?redirect=%2Ffounder["']/);
  });

  it("silently redirects authed non-owners to Home", () => {
    expect(FOUNDER).toMatch(/user\.is_owner\s*!==\s*true/);
    expect(FOUNDER).toMatch(/Navigate\s+to=["']\/["']/);
  });
});
