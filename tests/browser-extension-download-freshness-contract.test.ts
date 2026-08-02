import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";

/**
 * `public/downloads/wireline-command-*.zip` are the packages the install page
 * hands to real users, and nothing in `npm run build` or the Vercel build
 * regenerates them. That combination lets the shipped extension silently rot
 * behind `apps/browser-extension/` — which is exactly what happened: the
 * committed packages carried retired product copy long after the source moved
 * on, so every download served stale text.
 *
 * This contract reads the committed zips directly and compares each stored
 * entry's CRC-32 against the source file on disk. It needs no `zip`/`unzip`
 * binary and no build step, so it stays hermetic in CI. When it fails, run:
 *
 *   node apps/browser-extension/scripts/build.mjs
 *
 * and commit the refreshed zips.
 */

const root = process.cwd();
const extensionRoot = resolve(root, "apps/browser-extension");

/** Entries the build copies verbatim from source. Icons are rendered and the
 *  manifest is merged at build time, so both are owned by other contracts. */
const VERBATIM_SOURCE_DIRS = ["panel", "background"];

type ZipEntry = { name: string; crc: number };

/**
 * Minimal ZIP central-directory reader. The format is stable and tiny: locate
 * the End of Central Directory record, then walk fixed-layout entry headers.
 */
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

describe("browser-extension download freshness contract", () => {
  for (const target of ["chromium", "firefox"]) {
    it(`ships a ${target} package that matches the extension source`, () => {
      const zipPath = resolve(root, `public/downloads/wireline-command-${target}.zip`);
      const entries = new Map(readZipCentralDirectory(zipPath).map((e) => [e.name, e.crc]));

      const checked: string[] = [];
      for (const dir of VERBATIM_SOURCE_DIRS) {
        for (const sourcePath of listSourceFiles(resolve(extensionRoot, dir))) {
          const entryName = relative(extensionRoot, sourcePath).replaceAll("\\", "/");
          const packagedCrc = entries.get(entryName);

          expect(
            packagedCrc,
            `${target}: ${entryName} is missing from the shipped package — rebuild with ` +
              "`node apps/browser-extension/scripts/build.mjs`",
          ).toBeDefined();

          expect(
            packagedCrc,
            `${target}: ${entryName} in the shipped package does not match the source — rebuild ` +
              "with `node apps/browser-extension/scripts/build.mjs` and commit the refreshed zips",
          ).toBe(crc32(readFileSync(sourcePath)));

          checked.push(entryName);
        }
      }

      // A build that silently stopped copying the panel would otherwise pass an
      // empty loop. The panel and service worker are the surface users see.
      expect(checked.length, `${target}: no source files were compared`).toBeGreaterThan(3);
      expect(checked).toContain("panel/index.html");
      expect(checked).toContain("background/service-worker.js");
    });
  }
});
