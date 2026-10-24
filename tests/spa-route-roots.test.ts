import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isKnownSpaRoute, SPA_ROUTE_ROOTS } from "../src/lib/spa-route-roots";

/** Roots reserved for routes landing on a parallel branch (voice settings redirects). */
const RESERVED_ROOTS = new Set(["voice", "voice-clone", "voices"]);

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
    for (const root of SPA_ROUTE_ROOTS)
      if (!RESERVED_ROOTS.has(root)) expect(declared, root).toContain(root);
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
