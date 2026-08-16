import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isSessionOptionalPublicPath } from "../src/lib/public-routes";
import { isWorkspaceRoute, usesWorkspaceViewport } from "../src/lib/workspace-route-scope";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public route fallbacks", () => {
  it("wires the changelog and both explicit public 404 aliases", () => {
    const app = read("src/App.tsx");

    expect(app).toContain('path="/changelog" element={<PublicChangelog />}');
    expect(app).toContain('path="/404" element={<PublicNotFound />}');
    expect(app).toContain('path="/not-found" element={<PublicNotFound />}');
    expect(isSessionOptionalPublicPath("/changelog")).toBe(true);
    expect(isSessionOptionalPublicPath("/404")).toBe(true);
    expect(isSessionOptionalPublicPath("/not-found")).toBe(true);
  });

  it("defaults first paint to document flow and then resolves physical viewport ownership", () => {
    const index = read("index.html");
    const app = read("src/App.tsx");

    expect(index).toContain('<html lang="en" data-wireline-viewport="document">');
    expect(index).toContain('<body data-wireline-viewport="document">');
    expect(app).toContain("usesWorkspaceViewport(pathname, Boolean(user))");
    expect(app).toMatch(/<AuthProvider>[\s\S]*<ViewportModeRoot>/);
    expect(app).toContain("html.dataset.wirelineViewport = mode");
    expect(app).toContain("body.dataset.wirelineViewport = mode");
  });

  it("keeps anonymous and authenticated wildcard destinations distinct", () => {
    const app = read("src/App.tsx");
    const appRoutes = read("src/routes/AppRoutes.tsx");

    expect(app).toContain("return user ? <AppShell /> : <PublicNotFound />");
    expect(app).toContain("if (isWorkspaceRoute(pathname)) return <AppShell />");
    expect(app).toContain('path="/*" element={<UnknownRoute />}');
    expect(appRoutes).toContain('path="*" element={<AuthNotFound />}');
    for (const path of [
      "/overview",
      "/overview/",
      "/studio/abc",
      "/settings/phone/",
      "/email",
      "/email/",
    ]) {
      expect(isWorkspaceRoute(path), path).toBe(true);
      expect(usesWorkspaceViewport(path, false), `${path} is workspace-owned before auth`).toBe(
        true,
      );
    }
    expect(isSessionOptionalPublicPath("/email")).toBe(false);
    expect(isWorkspaceRoute("/totally-unknown")).toBe(false);
    expect(usesWorkspaceViewport("/totally-unknown", false)).toBe(false);
    expect(usesWorkspaceViewport("/totally-unknown", true)).toBe(true);
    expect(isWorkspaceRoute("/pricing")).toBe(false);
    expect(usesWorkspaceViewport("/pricing", true)).toBe(false);
    expect(usesWorkspaceViewport("/onboarding", true)).toBe(false);
    expect(usesWorkspaceViewport("/accept-invite", true)).toBe(false);
  });

  it("captures the live solution routes rather than the retired personal alias", () => {
    for (const path of ["scripts/capture-prod-visual-qa.mjs", "tests/e2e/public-routes.spec.ts"]) {
      const source = read(path);
      expect(source, path).toContain('"/solutions/support"');
      expect(source, path).toContain('"/solutions/sales"');
      expect(source, path).not.toContain('"/solutions/personal"');
    }
  });
});
