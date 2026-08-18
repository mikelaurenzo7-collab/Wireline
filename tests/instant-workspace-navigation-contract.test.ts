import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("instant workspace navigation contract", () => {
  it("shares lazy route importers with navigation intent preloading", () => {
    const preload = source("src/routes/workspace-route-preload.ts");
    const routes = source("src/routes/AppRoutes.tsx");

    expect(preload).toContain("export function preloadWorkspaceRoute");
    expect(preload).toContain('pathname === "/overview"');
    expect(preload).toContain('pathname === "/studio"');
    expect(preload).toContain('pathname === "/settings/billing"');
    expect(routes).toContain('from "./workspace-route-preload"');
    expect(routes).toContain("lazy(loadOverviewPage)");
  });

  it("warms route bundles before interaction and keeps primary navigation transitional", () => {
    const shell = source("src/components/WorkspaceShell.tsx");

    expect(shell).toContain('document.addEventListener("pointerover", preload, true)');
    expect(shell).toContain('document.addEventListener("focusin", preload, true)');
    expect(shell).toContain('document.addEventListener("touchstart", preload, true)');
    expect(shell).toContain('closest<HTMLAnchorElement>("a[data-wireline-nav-href]")');
    expect(shell).toContain("startTransition(() => navigate(");
  });
});
