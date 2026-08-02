import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/**
 * Resolve a Chromium executable for sandboxes whose preinstalled browser cache
 * (PLAYWRIGHT_BROWSERS_PATH) carries a different build than this Playwright
 * version pins and where downloading the pinned build is blocked. Without
 * this, every page fixture dies at launch ("Executable doesn't exist at
 * .../chromium_headless_shell-<pin>/...") while request-only tests still pass,
 * which reads as mass app breakage instead of a missing binary.
 *
 * Resolution order:
 *  1. Explicit WIRELINE_E2E_CHROMIUM always wins.
 *  2. If the pinned headless-shell build exists, return undefined so
 *     Playwright resolves browsers itself (CI and local installs).
 *  3. If the pinned full-Chromium build exists, point at its chrome binary.
 *  4. Otherwise fall back to the newest preinstalled chromium-<build>.
 */
export function resolvePreinstalledChromium(env = process.env) {
  if (env.WIRELINE_E2E_CHROMIUM) return env.WIRELINE_E2E_CHROMIUM;
  const browsersPath = env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !existsSync(browsersPath)) return undefined;

  try {
    const manifest = require("playwright-core/browsers.json");
    const revisionOf = (name) =>
      manifest.browsers?.find((browser) => browser.name === name)?.revision;

    const shellRevision = revisionOf("chromium-headless-shell");
    if (
      shellRevision &&
      existsSync(path.join(browsersPath, `chromium_headless_shell-${shellRevision}`))
    ) {
      return undefined;
    }

    const chromiumRevision = revisionOf("chromium");
    if (chromiumRevision) {
      const pinned = path.join(
        browsersPath,
        `chromium-${chromiumRevision}`,
        "chrome-linux",
        "chrome",
      );
      if (existsSync(pinned)) return pinned;
    }
  } catch {
    // Manifest unreadable — fall through to the newest preinstalled build.
  }

  try {
    const builds = readdirSync(browsersPath)
      .filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.slice("chromium-".length)) - Number(a.slice("chromium-".length)));
    for (const build of builds) {
      const executable = path.join(browsersPath, build, "chrome-linux", "chrome");
      if (existsSync(executable)) return executable;
    }
  } catch {
    // Browsers directory unreadable — let Playwright resolve normally.
  }
  return undefined;
}

/**
 * The launch-options fragment every `chromium.launch()` in `scripts/` should
 * spread, so the resolution above is applied once rather than remembered six
 * times.
 *
 * It was remembered once. The helper was written for the asset-capture
 * sandboxes and then wired into a single caller, which left both asset
 * producers — the marketing kit that records the launch reels, and the official
 * asset builder — dying at launch with "Executable doesn't exist" wherever
 * browsers are preinstalled rather than downloaded. A reel cannot be re-cut from
 * a script that cannot open a browser.
 *
 * Returns an empty object when Playwright should resolve browsers itself, so
 * spreading it is a no-op on CI and on a normal local install.
 */
export function chromiumLaunchOptions(env = process.env) {
  const executablePath = resolvePreinstalledChromium(env);
  return executablePath ? { executablePath } : {};
}
