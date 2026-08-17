#!/usr/bin/env node
/**
 * Release-time client bundle budgets.
 *
 * Vite's warning threshold is raw chunk size and does not protect the actual
 * first load. This gate measures the generated artifacts exactly as deployed,
 * after route splitting and minification, and fails before promotion when the
 * public entry path or any single lazy surface grows beyond deliberate limits.
 *
 * Budgets carry roughly 25-35% headroom over the August 2026 launch candidate.
 * Raise one only with a measured product reason and an accompanying note in the
 * commit/PR; do not increase budgets merely to make a red build green.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const dist = path.resolve(process.cwd(), "dist");
const assetsDir = path.join(dist, "assets");
const indexPath = path.join(dist, "index.html");

const KIB = 1024;
const BUDGETS = Object.freeze({
  initialTransferGzip: 320 * KIB,
  entryJavaScriptGzip: 80 * KIB,
  entryCssGzip: 90 * KIB,
  largestLazyJavaScriptGzip: 160 * KIB,
  largestRawAsset: 600 * KIB,
});

function fail(message) {
  console.error(`Client bundle budget FAILED: ${message}`);
  process.exit(1);
}

function gzipBytes(filePath) {
  return gzipSync(readFileSync(filePath), { level: 9 }).byteLength;
}

function formatKiB(bytes) {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}

if (!existsSync(indexPath) || !existsSync(assetsDir)) {
  fail("dist/index.html or dist/assets is missing; run the production build first.");
}

const html = readFileSync(indexPath, "utf8");
const referencedAssets = Array.from(
  new Set(
    Array.from(html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))(?:\?[^"']*)?["']/g), ([, ref]) =>
      ref.replace(/^https?:\/\/[^/]+/i, "").replace(/^\//, ""),
    ).filter((ref) => ref.startsWith("assets/")),
  ),
);

if (!referencedAssets.length) {
  fail("the production HTML exposes no measurable JavaScript or CSS assets.");
}

const allClientAssets = readdirSync(assetsDir)
  .filter((name) => /\.(?:js|css)$/.test(name))
  .map((name) => ({
    name,
    filePath: path.join(assetsDir, name),
  }));

if (!allClientAssets.length) fail("dist/assets contains no JavaScript or CSS bundles.");

const unexpectedSourceMaps = readdirSync(assetsDir).filter((name) => name.endsWith(".map"));
if (unexpectedSourceMaps.length) {
  fail(`public source maps were emitted: ${unexpectedSourceMaps.slice(0, 5).join(", ")}`);
}

const initialAssets = referencedAssets.map((ref) => {
  const filePath = path.join(dist, ref);
  if (!existsSync(filePath)) fail(`index.html references missing asset ${ref}.`);
  return {
    name: path.basename(filePath),
    filePath,
    gzip: gzipBytes(filePath),
  };
});

const initialTransferGzip = initialAssets.reduce((sum, asset) => sum + asset.gzip, 0);
const entryJavaScript = initialAssets.find(
  (asset) => asset.name.startsWith("index-") && asset.name.endsWith(".js"),
);
const entryCss = initialAssets.find(
  (asset) => asset.name.startsWith("index-") && asset.name.endsWith(".css"),
);

if (!entryJavaScript) fail("the hashed Vite JavaScript entry was not found in index.html.");
if (!entryCss) fail("the hashed Vite stylesheet entry was not found in index.html.");

const measured = allClientAssets.map((asset) => {
  const raw = readFileSync(asset.filePath).byteLength;
  return { ...asset, raw, gzip: gzipBytes(asset.filePath) };
});
const javascript = measured.filter((asset) => asset.name.endsWith(".js"));
const largestLazyJavaScript = javascript
  .filter((asset) => asset.name !== entryJavaScript.name)
  .sort((a, b) => b.gzip - a.gzip)[0];
const largestRawAsset = [...measured].sort((a, b) => b.raw - a.raw)[0];

const breaches = [];
if (initialTransferGzip > BUDGETS.initialTransferGzip) {
  breaches.push(
    `initial referenced transfer is ${formatKiB(initialTransferGzip)} (budget ${formatKiB(
      BUDGETS.initialTransferGzip,
    )})`,
  );
}
if (entryJavaScript.gzip > BUDGETS.entryJavaScriptGzip) {
  breaches.push(
    `${entryJavaScript.name} is ${formatKiB(entryJavaScript.gzip)} gzip (budget ${formatKiB(
      BUDGETS.entryJavaScriptGzip,
    )})`,
  );
}
if (entryCss.gzip > BUDGETS.entryCssGzip) {
  breaches.push(
    `${entryCss.name} is ${formatKiB(entryCss.gzip)} gzip (budget ${formatKiB(
      BUDGETS.entryCssGzip,
    )})`,
  );
}
if (
  largestLazyJavaScript &&
  largestLazyJavaScript.gzip > BUDGETS.largestLazyJavaScriptGzip
) {
  breaches.push(
    `${largestLazyJavaScript.name} is ${formatKiB(
      largestLazyJavaScript.gzip,
    )} gzip (single-lazy-chunk budget ${formatKiB(BUDGETS.largestLazyJavaScriptGzip)})`,
  );
}
if (largestRawAsset.raw > BUDGETS.largestRawAsset) {
  breaches.push(
    `${largestRawAsset.name} is ${formatKiB(largestRawAsset.raw)} raw (asset budget ${formatKiB(
      BUDGETS.largestRawAsset,
    )})`,
  );
}

if (breaches.length) fail(breaches.join("; "));

console.log(
  [
    "Client bundle budgets passed.",
    `initial=${formatKiB(initialTransferGzip)}/${formatKiB(BUDGETS.initialTransferGzip)}`,
    `entry-js=${formatKiB(entryJavaScript.gzip)}/${formatKiB(BUDGETS.entryJavaScriptGzip)}`,
    `entry-css=${formatKiB(entryCss.gzip)}/${formatKiB(BUDGETS.entryCssGzip)}`,
    largestLazyJavaScript
      ? `largest-lazy=${largestLazyJavaScript.name}:${formatKiB(
          largestLazyJavaScript.gzip,
        )}/${formatKiB(BUDGETS.largestLazyJavaScriptGzip)}`
      : "largest-lazy=none",
  ].join(" "),
);
