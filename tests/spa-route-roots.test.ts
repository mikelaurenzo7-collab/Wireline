import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { APP_ROUTE_FAMILIES, routeScopeFor } from "../src/lib/app-route-manifest";
import { isKnownSpaRoute, SPA_ROUTE_ROOTS } from "../src/lib/spa-route-roots";

function routeRoots(file: string): string[] {
  const source = readFileSync(file, "utf8");
  return [...source.matchAll(/<Route\s+path="\/([^"/*]*)/g)]
    .map((match) => match[1])
    .filter(Boolean);
}

describe("SPA route roots", () => {
  it("covers every first segment declared by the public and workspace routers", () => {
    const declared = new Set([
      ...routeRoots("src/App.tsx"),
      ...routeRoots("src/routes/AppRoutes.tsx"),
    ]);
    expect(declared.size).toBeGreaterThan(40);
    for (const root of declared) expect(SPA_ROUTE_ROOTS, root).toContain(root);
    for (const root of SPA_ROUTE_ROOTS) expect(declared, root).toContain(root);
  });

  it("keeps every route family unique and classifiable", () => {
    const paths = APP_ROUTE_FAMILIES.map(({ path }) => path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const family of APP_ROUTE_FAMILIES) {
      expect(routeScopeFor(family.path), family.path).toBe(family.scope);
    }
  });

  it.each(["/", "/pricing", "/for/medical", "/settings/billing", "/studio/agents/abc", "/Pricing"])(
    "treats %s as a real page",
    (path) => expect(isKnownSpaRoute(path)).toBe(true),
  );

  it.each(["/nope-xyz", "/voicesx", "/wp-admin/setup", "/pricingx"])(
    "treats %s as not found",
    (path) => expect(isKnownSpaRoute(path)).toBe(false),
  );
});
