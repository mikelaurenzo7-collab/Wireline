#!/usr/bin/env node
/** Certify one exact main production deployment, its alias, and its served source header. */
import {
  assertProductionDeploymentProvenance,
  assertReadyProductionDeployment,
  normalizeDeploymentId,
  normalizeExactCommitSha,
} from "./lib/vercel-deployment-policy.mjs";
import { CANONICAL_PRODUCTION_URL } from "./lib/production-url.mjs";
import { verifyRemoteSourceCommit } from "./lib/release-source-verification.mjs";
import { TEAM_ID, PROJECT_ID, requireVercelToken } from "./lib/vercel-project.mjs";

const usage =
  "Usage: VERCEL_TOKEN=... node scripts/wait-vercel-deployment.mjs <deploymentId> <exactCommitSha> --production";
const [deploymentIdInput, expectedCommitShaInput, mode, ...unexpectedArguments] =
  process.argv.slice(2);
if (
  !deploymentIdInput ||
  !expectedCommitShaInput ||
  mode !== "--production" ||
  unexpectedArguments.length
) {
  console.error(usage);
  process.exit(1);
}

let deploymentId;
let expectedCommitSha;
try {
  deploymentId = normalizeDeploymentId(deploymentIdInput);
  expectedCommitSha = normalizeExactCommitSha(expectedCommitShaInput);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(usage);
  process.exit(1);
}
const token = requireVercelToken(usage);
const canonicalAlias = new URL(CANONICAL_PRODUCTION_URL).hostname;
const waitableStates = new Set(["BUILDING", "INITIALIZING", "QUEUED"]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchDeployment() {
  const response = await fetch(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(TEAM_ID)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vercel API ${response.status}: ${text.slice(0, 800)}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Vercel deployment response was not valid JSON.");
  }
}

async function verifyCanonicalSourceWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      return await verifyRemoteSourceCommit(expectedCommitSha, CANONICAL_PRODUCTION_URL);
    } catch (error) {
      lastError = error;
      if (attempt < 12) await delay(5_000);
    }
  }
  throw lastError;
}

async function main() {
  for (let attempt = 1; attempt <= 36; attempt++) {
    const deployment = await fetchDeployment();
    const identity = assertProductionDeploymentProvenance(deployment, {
      expectedCommitSha,
      projectId: PROJECT_ID,
    });
    console.log(JSON.stringify({ checkedAt: new Date().toISOString(), attempt, ...identity }));

    if (identity.state === "READY") {
      const ready = assertReadyProductionDeployment(deployment, {
        expectedCommitSha,
        projectId: PROJECT_ID,
        canonicalAlias,
      });
      const sourceProof = await verifyCanonicalSourceWithRetry();
      console.log(
        JSON.stringify(
          { action: "production_deployment_certified", deployment: ready, sourceProof },
          null,
          2,
        ),
      );
      return;
    }
    if (identity.state === "ERROR" || identity.state === "CANCELED") {
      throw new Error(`Deployment ${deploymentId} ended in ${identity.state}.`);
    }
    if (!waitableStates.has(identity.state)) {
      throw new Error(`Refusing unexpected deployment state ${identity.state || "unknown"}.`);
    }
    await delay(10_000);
  }
  throw new Error("Timed out waiting for deployment");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
