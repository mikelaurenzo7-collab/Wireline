#!/usr/bin/env node
/** Redeploy one exact main production deployment after an environment-only change. */
import {
  assertProductionDeploymentProvenance,
  assertRedeploySource,
  normalizeDeploymentId,
  normalizeExactCommitSha,
} from "./lib/vercel-deployment-policy.mjs";
import { TEAM_ID, PROJECT_ID, requireVercelToken } from "./lib/vercel-project.mjs";

const usage =
  "Usage: VERCEL_TOKEN=... node scripts/redeploy-vercel-production.mjs <sourceDeploymentId> <exactCommitSha>";
const [sourceDeploymentIdInput, expectedCommitShaInput, ...unexpectedArguments] =
  process.argv.slice(2);
if (!sourceDeploymentIdInput || !expectedCommitShaInput || unexpectedArguments.length) {
  console.error(usage);
  process.exit(1);
}

let sourceDeploymentId;
let expectedCommitSha;
try {
  sourceDeploymentId = normalizeDeploymentId(sourceDeploymentIdInput);
  expectedCommitSha = normalizeExactCommitSha(expectedCommitShaInput);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  process.exit(1);
}
const token = requireVercelToken(usage);

function vercelUrl(path) {
  const sep = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${sep}teamId=${encodeURIComponent(TEAM_ID)}`;
}

async function vercelFetch(path, opts = {}) {
  const res = await fetch(vercelUrl(path), {
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
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 800)}`);
  return body;
}

async function main() {
  const source = await vercelFetch(`/v13/deployments/${encodeURIComponent(sourceDeploymentId)}`, {
    method: "GET",
  });
  const sourceIdentity = assertRedeploySource(source, {
    expectedCommitSha,
    projectId: PROJECT_ID,
  });
  console.log(
    JSON.stringify({ action: "redeploy_preflight_passed", source: sourceIdentity }, null, 2),
  );

  const result = await vercelFetch("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: "wireline",
      project: PROJECT_ID,
      target: "production",
      deploymentId: sourceDeploymentId,
    }),
  });

  const newDeploymentId = normalizeDeploymentId(result.id || result.uid);
  const created = await vercelFetch(`/v13/deployments/${encodeURIComponent(newDeploymentId)}`, {
    method: "GET",
  });
  const createdIdentity = assertProductionDeploymentProvenance(created, {
    expectedCommitSha,
    projectId: PROJECT_ID,
  });
  console.log(
    JSON.stringify(
      {
        action: "redeploy_created_not_certified",
        sourceDeploymentId,
        newDeploymentId,
        expectedCommitSha,
        state: createdIdentity.state,
        next: `npm run vercel:wait-deployment -- ${newDeploymentId} ${expectedCommitSha} --production`,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
