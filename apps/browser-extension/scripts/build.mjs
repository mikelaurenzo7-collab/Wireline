import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(currentDirectory, "..");
const repoRoot = resolve(extensionRoot, "../..");
const isCheck = process.argv.includes("--check");

function mergeManifest(base, overlay) {
  const output = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value)) {
      output[key] = [...new Set([...(Array.isArray(output[key]) ? output[key] : []), ...value])];
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = mergeManifest(
        output[key] && typeof output[key] === "object" && !Array.isArray(output[key])
          ? output[key]
          : {},
        value,
      );
      continue;
    }
    output[key] = value;
  }
  return output;
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(extensionRoot, relativePath), "utf8"));
}

function assertExtensionPolicy(manifest, target) {
  const permissions = new Set(manifest.permissions || []);
  const hostPermissions = manifest.host_permissions || [];

  if (manifest.manifest_version !== 3) throw new Error(`${target}: Manifest V3 is required.`);
  if (permissions.has("<all_urls>") || hostPermissions.includes("<all_urls>")) {
    throw new Error(`${target}: broad all-URLs access is prohibited.`);
  }
  if (hostPermissions.length) {
    throw new Error(`${target}: no persistent host permissions are permitted in the command baseline.`);
  }
  if (permissions.has("tabs")) {
    throw new Error(`${target}: tabs permission is prohibited — use activeTab only.`);
  }
  if (!permissions.has("activeTab") || !permissions.has("scripting")) {
    throw new Error(`${target}: explicit active-tab capture permissions are required.`);
  }
  if (target === "chromium" && !manifest.side_panel?.default_path) {
    throw new Error("chromium: side-panel entrypoint is required.");
  }
  if (target === "firefox" && !manifest.sidebar_action?.default_panel) {
    throw new Error("firefox: sidebar entrypoint is required.");
  }
}

async function renderIcons(outputDirectory) {
  const svg = await readFile(resolve(extensionRoot, "assets/icon.svg"));
  const iconDirectory = resolve(outputDirectory, "icons");
  await mkdir(iconDirectory, { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const image = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render();
    await writeFile(resolve(iconDirectory, `icon-${size}.png`), image.asPng());
  }
}

function zipTarget(target, outputDirectory) {
  const zipName = `wireline-command-${target}.zip`;
  const zipPath = resolve(extensionRoot, "dist", zipName);
  const result = spawnSync("zip", ["-r", "-q", zipPath, "."], {
    cwd: outputDirectory,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${target}: zip failed — ${result.stderr || result.stdout || "unknown error"}`);
  }
  return zipPath;
}

async function publishDownload(zipPath, target) {
  const downloadsDir = resolve(repoRoot, "public/downloads");
  await mkdir(downloadsDir, { recursive: true });
  await cp(zipPath, resolve(downloadsDir, `wireline-command-${target}.zip`));
}

async function buildTarget(target) {
  const base = await readJson("manifest.base.json");
  const overlay = await readJson(`manifest.${target}.json`);
  const manifest = mergeManifest(base, overlay);
  assertExtensionPolicy(manifest, target);
  if (isCheck) return;

  const outputDirectory = resolve(extensionRoot, "dist", target);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    cp(resolve(extensionRoot, "background"), resolve(outputDirectory, "background"), {
      recursive: true,
    }),
    cp(resolve(extensionRoot, "panel"), resolve(outputDirectory, "panel"), { recursive: true }),
    renderIcons(outputDirectory),
  ]);
  await writeFile(resolve(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const zipPath = zipTarget(target, outputDirectory);
  await publishDownload(zipPath, target);
}

await Promise.all([buildTarget("chromium"), buildTarget("firefox")]);
console.log(
  isCheck
    ? "Wireline browser-extension policy checks passed."
    : "Wireline browser-extension builds + public/downloads zips created.",
);
