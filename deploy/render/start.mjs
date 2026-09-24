import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
process.chdir(root);
const role = process.argv[2];
if (role !== "api" && role !== "voice")
  throw new Error("Usage: node deploy/render/start.mjs api|voice");
if (process.versions.node.split(".")[0] !== "22")
  throw new Error("Render services require Node 22.");
const release = JSON.parse(readFileSync(resolve(root, "dist/render-release.json"), "utf8"));
const revision = process.env.RENDER_GIT_COMMIT?.trim().toLowerCase() || "";
if (!/^[a-f0-9]{40}$/.test(revision) || release.role !== role || release.revision !== revision) {
  throw new Error(
    "The compiled artifact does not match this Render service's source revision and role.",
  );
}
if (process.env.VERCEL === "1" || process.env.VERCEL_ENV) {
  throw new Error("Remove Vercel deployment metadata from the Render environment.");
}
if (
  process.env.WIRELINE_DEPLOYMENT_ENVIRONMENT !== "production" ||
  process.env.NODE_ENV !== "production"
) {
  throw new Error(
    "The Render production Blueprint requires an explicit production runtime identity.",
  );
}
// Never label a different artifact as the intended release. The startup proof
// above ties these existing readiness fields to the actual Render build.
process.env.WIRELINE_SOURCE_REVISION = revision;
process.env.WIRELINE_EXPECTED_SOURCE_REVISION = revision;
if (role === "voice") {
  process.env.WIRELINE_VOICE_WORKER = "true";
  process.env.WIRELINE_VOICE_WORKER_SOURCE_REVISION = revision;
} else if (process.env.WIRELINE_VOICE_WORKER === "true") {
  throw new Error("The API service cannot use the voice-worker runtime role.");
}

// Import in this process so Render SIGTERM reaches the existing shutdown and
// drain handlers directly. An npm wrapper must not own the application PID.
await import(
  pathToFileURL(resolve(root, role === "api" ? "dist/server.cjs" : "dist/voice-worker.cjs")).href
);
