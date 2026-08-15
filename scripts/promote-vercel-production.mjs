/**
 * Point trywireline.com (and other production domains) at a specific deployment.
 *
 * Usage (PowerShell):
 *   $env:VERCEL_TOKEN = "<token from Vercel dashboard → Tokens>"
 *   node scripts/promote-vercel-production.mjs [deploymentId] [expectedCommitSha]
 *
 * If deploymentId is omitted, defaults to the latest READY production-target
 * deployment from `main` (requires VERCEL_TOKEN; uses Vercel REST API).
 * The expected commit SHA is mandatory via the second argument,
 * WIRELINE_EXPECTED_COMMIT_SHA, or VERCEL_GIT_COMMIT_SHA.
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
    if (ref === "main" && d.target === "production" && state === "READY" && id) return id;
  }
  throw new Error(
    "No READY production-target deployment from main found in the first page of results.",
  );
}

async function assertPromotionCandidate(deploymentId, expectedCommitSha) {
  if (!/^[0-9a-f]{40}$/i.test(expectedCommitSha)) {
    throw new Error(
      "Provide the exact 40-character commit SHA as the second argument or WIRELINE_EXPECTED_COMMIT_SHA.",
    );
  }

  const deployment = await vercelFetch(`/v13/deployments/${encodeURIComponent(deploymentId)}`, {
    method: "GET",
  });
  const state = deployment.state || deployment.readyState;
  const projectId = deployment.projectId || deployment.project?.id;
  const commitRef = String(deployment.meta?.githubCommitRef || "");
  const commitSha = String(deployment.meta?.githubCommitSha || "");

  if (projectId !== PROJECT_ID) {
    throw new Error(`Refusing deployment from another project: ${projectId || "unknown"}.`);
  }
  if (state !== "READY" || deployment.aliasError) {
    throw new Error(`Refusing deployment that is not cleanly READY: ${state || "unknown"}.`);
  }
  if (deployment.target !== "production") {
    throw new Error(
      "Refusing to promote a preview artifact. Preview builds skip production migrations and production-only release gates; create a production-target build instead.",
    );
  }
  if (commitRef !== "main") {
    throw new Error(`Refusing non-main deployment from ${commitRef || "unknown branch"}.`);
  }
  if (commitSha.toLowerCase() !== expectedCommitSha.toLowerCase()) {
    throw new Error(
      `Refusing stale or unexpected deployment SHA ${commitSha || "unknown"}; expected ${expectedCommitSha}.`,
    );
  }

  return deployment;
}

async function main() {
  let deploymentId = process.argv[2];
  const expectedCommitSha = String(
    process.argv[3] ||
      process.env.WIRELINE_EXPECTED_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      "",
  ).trim();
  if (!deploymentId) {
    deploymentId = await latestMainDeploymentId();
    console.log("Using latest main deployment:", deploymentId);
  }

  const deployment = await assertPromotionCandidate(deploymentId, expectedCommitSha);
  console.log(
    "Promotion preflight passed:",
    JSON.stringify({
      deploymentId,
      target: deployment.target,
      branch: deployment.meta?.githubCommitRef,
      commitSha: deployment.meta?.githubCommitSha,
    }),
  );

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
