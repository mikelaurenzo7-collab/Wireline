/**
 * Static manifest of authenticated routes — catches drift when IA changes
 * (missing /training route, broken legacy redirects, etc.).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROUTES_SRC = readFileSync(join(import.meta.dirname, "AppRoutes.tsx"), "utf8");

/** Canonical authenticated pages that must have a Route (not only redirects). */
const REQUIRED_PAGE_ROUTES = [
  "/ops",
  "/triage",
  "/founder",
  "/insights",
  "/phone",
  "/email",
  "/sms",
  "/agents",
  "/chat",
  "/training",
  "/integrations",
  "/admin",
  "/dnc",
  "/audit",
  "/help",
  "/pipeline",
  "/contact/:number",
] as const;

/** Legacy paths that must redirect forward (Navigate or ActivityRedirect). */
const REQUIRED_LEGACY_REDIRECTS: { path: string; target: string }[] = [
  { path: "/dashboard", target: "/ops" },
  { path: "/command", target: "/ops" },
  { path: "/live", target: "/ops" },
  { path: "/logs", target: "/phone" },
  { path: "/inbox", target: "/email" },
  { path: "/outbound", target: "/phone?tab=outbound" },
  { path: "/cockpit", target: "/ops?tab=floor" },
  { path: "/appointments", target: "/phone?tab=appointments" },
  { path: "/knowledge", target: "/training?tab=database" },
  { path: "/train", target: "/training" },
  { path: "/director", target: "/chat" },
  { path: "/account", target: "/admin?tab=subscription" },
  { path: "/billing", target: "/admin?tab=subscription" },
  { path: "/admin/growth", target: "/admin?tab=flywheel" },
  { path: "/ops/actions", target: "/ops?tab=intel" },
  { path: "/activity", target: "ActivityRedirect" },
];

describe("AppRoutes manifest", () => {
  for (const path of REQUIRED_PAGE_ROUTES) {
    it(`registers page route ${path}`, () => {
      expect(APP_ROUTES_SRC).toMatch(new RegExp(`path="${path.replace(":number", ":number")}"`));
    });
  }

  for (const { path, target } of REQUIRED_LEGACY_REDIRECTS) {
    it(`legacy ${path} forwards to ${target}`, () => {
      expect(APP_ROUTES_SRC).toContain(`path="${path}"`);
      if (target === "ActivityRedirect") {
        expect(APP_ROUTES_SRC).toContain("ActivityRedirect");
      } else {
        expect(APP_ROUTES_SRC).toContain(`to="${target}"`);
      }
    });
  }

  it("does not mount deleted ActivityPage", () => {
    expect(APP_ROUTES_SRC).not.toContain("ActivityPage");
  });

  it("lazy-loads Training page component", () => {
    expect(APP_ROUTES_SRC).toMatch(/import\("\.\.\/pages\/Training"\)/);
  });
});
