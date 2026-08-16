import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PRERENDERED_MARKETING_ROUTES,
  PRERENDERED_ROUTE_SHELLS,
  resolveRouteMeta,
} from "../src/lib/marketing-route-meta";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("prerender runtime compatibility", () => {
  it("keeps the production server on the complete emitted-shell registry", () => {
    const server = read("server.ts");

    expect(PRERENDERED_MARKETING_ROUTES).toBe(PRERENDERED_ROUTE_SHELLS);
    expect(server).toContain(
      'import { PRERENDERED_MARKETING_ROUTES } from "./src/lib/marketing-route-meta";',
    );
    expect(server).toContain("PRERENDERED_MARKETING_ROUTES.map((route) => [");
    expect(server).toContain("prerenderedShells.get(normalizedPath) ?? indexHtml");
  });

  it("includes guarded account shells in the production server registry", () => {
    for (const route of [
      "/signin",
      "/signup",
      "/reset",
      "/reset-password",
      "/accept-invite",
      "/onboarding",
      "/auth/oauth-complete",
      "/404",
    ]) {
      expect(PRERENDERED_MARKETING_ROUTES, route).toContain(route);
      expect(resolveRouteMeta(route)?.noIndex, route).toBe(true);
    }
  });
});
