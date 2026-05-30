/**
 * One-shot: pull Vapi env from Vercel, sync showcase assistants, patch Flux.
 * Usage: VERCEL_TOKEN=… node scripts/run-vapi-showcase-sync.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const TEAM = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
const token = process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("VERCEL_TOKEN not set");
  process.exit(1);
}

const keys = [
  "VAPI_PRIVATE_KEY",
  "VITE_VAPI_PUBLIC_KEY",
  "VAPI_WEBHOOK_SECRET",
  "MIGRATION_TOKEN",
];

const res = await fetch(
  `https://api.vercel.com/v9/projects/${PID}/env?decrypt=true&teamId=${TEAM}`,
  { headers: { Authorization: `Bearer ${token}` } },
);
const data = await res.json();
if (!res.ok) {
  console.error("Vercel env fetch failed", res.status, JSON.stringify(data).slice(0, 300));
  process.exit(1);
}

for (const k of keys) {
  const e = (data.envs || []).find((x) => x.key === k);
  const v = e?.value || "";
  console.log(JSON.stringify({ key: k, ok: v.length > 0, len: v.length }));
  if (v) process.env[k] = v;
}

if (!process.env.VAPI_PRIVATE_KEY) {
  const fallback = process.env.VAPI_KEY?.trim();
  if (fallback) {
    process.env.VAPI_PRIVATE_KEY = fallback;
    console.log(JSON.stringify({ key: "VAPI_PRIVATE_KEY", source: "VAPI_KEY env" }));
  } else {
    console.error("VAPI_PRIVATE_KEY missing from Vercel and no VAPI_KEY fallback");
    process.exit(1);
  }
}

function run(label, args) {
  console.log(`\n--- ${label} ---`);
  const r = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
    cwd: root,
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

run("sync-wireline-showcase", [
  join(root, "node_modules/tsx/dist/cli.mjs"),
  join(root, "scripts/sync-wireline-showcase.mts"),
]);
run("patch-vapi-showcase-flux-ab", [join(root, "scripts/patch-vapi-showcase-flux-ab.mjs")]);

console.log("\nDone.");
