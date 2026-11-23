import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolvePreinstalledChromium } from "../scripts/lib/resolve-preinstalled-chromium.mjs";

const roots: string[] = [];

function browsersDir(builds: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "pw-browsers-"));
  roots.push(root);
  for (const [build, platformDir] of Object.entries(builds)) {
    const dir = path.join(root, build, platformDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "chrome"), "");
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolvePreinstalledChromium", () => {
  it("finds a preinstalled build in the chrome-linux64 layout newer Chromium ships", () => {
    const root = browsersDir({
      "chromium-1100": "chrome-linux",
      "chromium-1243": "chrome-linux64",
    });
    expect(resolvePreinstalledChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(
      path.join(root, "chromium-1243", "chrome-linux64", "chrome"),
    );
  });

  it("still finds the older chrome-linux layout", () => {
    const root = browsersDir({ "chromium-1100": "chrome-linux" });
    expect(resolvePreinstalledChromium({ PLAYWRIGHT_BROWSERS_PATH: root })).toBe(
      path.join(root, "chromium-1100", "chrome-linux", "chrome"),
    );
  });

  it("lets an explicit override win and leaves Playwright alone without a browsers path", () => {
    expect(resolvePreinstalledChromium({ WIRELINE_E2E_CHROMIUM: "/x/chrome" })).toBe("/x/chrome");
    expect(resolvePreinstalledChromium({})).toBeUndefined();
  });
});
