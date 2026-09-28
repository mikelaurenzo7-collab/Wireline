import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { crc32 } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Browser-extension archives are generated release artifacts. The canonical
 * asset build rebuilds them before Vite packages public/, and this contract
 * creates isolated archives from the current source so committed binary age can
 * never mask what production will ship.
 */

const root = process.cwd();
const extensionRoot = resolve(root, "apps/browser-extension");
const outputRoot = mkdtempSync(join(tmpdir(), "wireline-extension-contract-"));
const VERBATIM_SOURCE_DIRS = ["panel", "background"];
const EXTENSION_BUILD_CHILD_TIMEOUT_MS = 120_000;
const EXTENSION_BUILD_HOOK_MARGIN_MS = 30_000;

type ZipEntry = { name: string; crc: number };

function readZipCentralDirectory(zipPath: string): ZipEntry[] {
  const buffer = readFileSync(zipPath);
  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;

  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  expect(eocd, `${zipPath}: no ZIP end-of-central-directory record`).toBeGreaterThanOrEqual(0);

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < entryCount; i += 1) {
    expect(buffer.readUInt32LE(offset), `${zipPath}: malformed central directory`).toBe(
      CENTRAL_SIGNATURE,
    );
    const crc = buffer.readUInt32LE(offset + 16);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push({ name, crc });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function listSourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const item of readdirSync(directory)) {
    const full = join(directory, item);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else out.push(full);
  }
  return out;
}

beforeAll(() => {
  const result = spawnSync(
    process.execPath,
    [resolve(extensionRoot, "scripts/build.mjs"), "--output-root", outputRoot, "--no-publish"],
    { cwd: root, encoding: "utf8", timeout: EXTENSION_BUILD_CHILD_TIMEOUT_MS },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Browser-extension test packaging failed.");
  }
}, EXTENSION_BUILD_CHILD_TIMEOUT_MS + EXTENSION_BUILD_HOOK_MARGIN_MS);

afterAll(() => {
  rmSync(outputRoot, { recursive: true, force: true });
});

describe("browser-extension download freshness contract", () => {
  it("wires extension packaging into the canonical production asset build", () => {
    const renderer = readFileSync(resolve(root, "scripts/render-image-assets.mjs"), "utf8");
    expect(renderer).toContain("apps/browser-extension/scripts/build.mjs");
    expect(renderer).toContain("Browser-extension packaging failed");
  });

  it("packages a Chromium module service worker for Chrome, Edge, and Brave without Firefox-only background keys", () => {
    const manifestPath = resolve(outputRoot, "chromium/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.background).toEqual({
      service_worker: "background/service-worker.js",
      type: "module",
    });
    expect(Number.parseInt(manifest.minimum_chrome_version, 10)).toBeGreaterThanOrEqual(116);
    expect(manifest.side_panel).toEqual({ default_path: "panel/index.html" });
    expect(manifest.permissions.toSorted()).toEqual(
      ["activeTab", "contextMenus", "scripting", "sidePanel"].toSorted(),
    );
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("sidebar_action");
    expect(manifest).not.toHaveProperty("browser_specific_settings");
  });

  it("packages a Firefox module background script and sidebar without unsupported service-worker keys", () => {
    const manifestPath = resolve(outputRoot, "firefox/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.background).toEqual({
      scripts: ["background/service-worker.js"],
      type: "module",
    });
    expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe("128.0");
    expect(manifest.sidebar_action.default_panel).toBe("panel/index.html");
    expect(manifest.permissions.toSorted()).toEqual(
      ["activeTab", "contextMenus", "scripting"].toSorted(),
    );
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("side_panel");
    expect(manifest).not.toHaveProperty("minimum_chrome_version");
  });

  for (const target of ["chromium", "firefox"]) {
    it(`generates a ${target} package that exactly matches the extension source`, () => {
      const zipPath = resolve(outputRoot, `botbound-command-${target}.zip`);
      const entries = new Map(
        readZipCentralDirectory(zipPath).map((entry) => [entry.name, entry.crc]),
      );

      expect(
        entries.get("manifest.json"),
        `${target}: ZIP manifest differs from the built manifest`,
      ).toBe(crc32(readFileSync(resolve(outputRoot, target, "manifest.json"))));

      const checked: string[] = [];
      for (const directory of VERBATIM_SOURCE_DIRS) {
        for (const sourcePath of listSourceFiles(resolve(extensionRoot, directory))) {
          const entryName = relative(extensionRoot, sourcePath).replaceAll("\\", "/");
          const packagedCrc = entries.get(entryName);

          expect(
            packagedCrc,
            `${target}: ${entryName} is missing from the generated package`,
          ).toBeDefined();
          expect(packagedCrc, `${target}: ${entryName} does not match current source`).toBe(
            crc32(readFileSync(sourcePath)),
          );
          checked.push(entryName);
        }
      }

      expect(checked.length, `${target}: no source files were compared`).toBeGreaterThan(3);
      expect(checked).toContain("panel/index.html");
      expect(checked).toContain("background/service-worker.js");
    });

    it(`keeps the published ${target} download synchronized with the generated package`, () => {
      const generated = new Map(
        readZipCentralDirectory(resolve(outputRoot, `botbound-command-${target}.zip`)).map(
          (entry) => [entry.name, entry.crc],
        ),
      );
      const published = new Map(
        readZipCentralDirectory(
          resolve(root, `public/downloads/botbound-command-${target}.zip`),
        ).map((entry) => [entry.name, entry.crc]),
      );

      expect([...published.keys()].sort()).toEqual([...generated.keys()].sort());
      for (const [entryName, generatedCrc] of generated) {
        expect(published.get(entryName), `${target}: published ${entryName} is stale`).toBe(
          generatedCrc,
        );
      }

      const legacyAlias = new Map(
        readZipCentralDirectory(
          resolve(root, `public/downloads/wireline-command-${target}.zip`),
        ).map((entry) => [entry.name, entry.crc]),
      );
      expect(legacyAlias).toEqual(published);
    });
  }
});
