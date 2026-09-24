import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolateApiPublicOutput } from "./public-output.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const role = process.argv[2];
if (role !== "api" && role !== "voice")
  throw new Error("Usage: node deploy/render/build.mjs api|voice");
if (process.versions.node.split(".")[0] !== "22") throw new Error("Render builds require Node 22.");
const revision = process.env.RENDER_GIT_COMMIT?.trim().toLowerCase() || "";
if (!/^[a-f0-9]{40}$/.test(revision))
  throw new Error("RENDER_GIT_COMMIT must identify the full release commit.");
const checkout = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
if (checkout.status !== 0 || checkout.stdout.trim().toLowerCase() !== revision) {
  throw new Error("Render's source revision does not match the checked-out commit.");
}
const dirty = spawnSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
  encoding: "utf8",
});
if (dirty.status !== 0 || dirty.stdout.trim())
  throw new Error("Release builds require a clean source checkout.");
if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
  throw new Error("Remove Vercel deployment metadata from the Render environment.");
}

const run = (args) => {
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, HUSKY: "0" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

// Compile only: database migrations, provider probes, and live configuration
// changes belong to separately approved release operations, never this build.
run(["ci", "--include=dev", "--ignore-scripts"]);
run(["run", role === "api" ? "build" : "build:voice-worker"]);
if (role === "api") isolateApiPublicOutput(root);
mkdirSync(resolve(root, "dist"), { recursive: true });
writeFileSync(resolve(root, "dist/render-release.json"), JSON.stringify({ role, revision }) + "\n");
