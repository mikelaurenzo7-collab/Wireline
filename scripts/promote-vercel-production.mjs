/**
 * Point trywireline.com (and other production domains) at a specific deployment.
 *
 * Usage (PowerShell):
 *   $env:VERCEL_TOKEN = "<token from Vercel dashboard → Tokens>"
 *   node scripts/promote-vercel-production.mjs [deploymentId]
 *
 * If deploymentId is omitted, defaults to the latest READY deployment from `main`
 * (requires VERCEL_TOKEN; uses Vercel REST API).
 *
 * API: POST https://api.vercel.com/v1/projects/{projectId}/promote/{deploymentId}?teamId=...
 * (v10 promote returns 422 for staged main builds on this project.)
 */
import { TEAM_ID, PROJECT_ID } from "./lib/vercel-project.mjs";

const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
if (!token) {
  console.error("Set VERCEL_TOKEN (or VERCEL_OIDC_TOKEN) in the environment.");
  process.exit(1);
}

function vercelUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function vercelFetch(path, opts = {}) {
  const url = vercelUrl(path);
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`Vercel API ${res.status}: ${text.slice(0, 500)}`);
    err.body = body;
    throw err;
  }
  return body;
}

async function latestMainDeploymentId() {
  const data = await vercelFetch(
    `/v6/deployments?projectId=${encodeURIComponent(PROJECT_ID)}&limit=30`,
    { method: "GET" },
  );
  const list = data.deployments || [];
  for (const d of list) {
    const ref = d.meta?.githubCommitRef;
    const state = d.state || d.readyState;
    const id = d.uid || d.id;
    if (ref === "main" && state === "READY" && id) return id;
  }
  throw new Error("No READY deployment from main found in the first page of results.");
}

async function main() {
  let deploymentId = process.argv[2];
  if (!deploymentId) {
    deploymentId = await latestMainDeploymentId();
    console.log("Using latest main deployment:", deploymentId);
  }

  const promotePath = `/v1/projects/${encodeURIComponent(PROJECT_ID)}/promote/${encodeURIComponent(deploymentId)}`;
  const result = await vercelFetch(promotePath, { method: "POST" });
  console.log("Promote response:", JSON.stringify(result, null, 2));
  console.log("\nProduction domains for this project should now target:", deploymentId);
  console.log("Inspect: https://vercel.com/revaluate/wireline/deployments");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
