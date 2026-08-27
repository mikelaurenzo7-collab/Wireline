const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const VERCEL_DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;

const REDEPLOY_SOURCE_STATES = new Set(["ERROR", "READY"]);

export function normalizeExactCommitSha(value) {
  const commitSha = String(value || "")
    .trim()
    .toLowerCase();
  if (!EXACT_COMMIT_SHA.test(commitSha)) {
    throw new Error("Provide the exact 40-character commit SHA.");
  }
  return commitSha;
}

export function normalizeDeploymentId(value) {
  const deploymentId = String(value || "").trim();
  if (!VERCEL_DEPLOYMENT_ID.test(deploymentId)) {
    throw new Error("Provide an explicit Vercel deployment ID beginning with dpl_.");
  }
  return deploymentId;
}

function normalizeAliasHost(value) {
  const candidate =
    typeof value === "string" ? value : value?.alias || value?.domain || value?.name || "";
  if (!candidate) return "";
  try {
    return new URL(candidate.includes("://") ? candidate : `https://${candidate}`).hostname
      .toLowerCase()
      .replace(/\.$/, "");
  } catch {
    return "";
  }
}

export function deploymentIdentity(deployment) {
  const aliases = Array.isArray(deployment?.alias)
    ? deployment.alias
    : Array.isArray(deployment?.aliases)
      ? deployment.aliases
      : [];
  return {
    deploymentId: String(deployment?.uid || deployment?.id || ""),
    projectId: String(deployment?.projectId || deployment?.project?.id || ""),
    target: String(deployment?.target || ""),
    state: String(deployment?.readyState || deployment?.state || ""),
    commitRef: String(deployment?.meta?.githubCommitRef || ""),
    commitSha: String(deployment?.meta?.githubCommitSha || "")
      .trim()
      .toLowerCase(),
    aliasError: deployment?.aliasError || null,
    aliasHosts: aliases.map(normalizeAliasHost).filter(Boolean),
  };
}

export function assertProductionDeploymentProvenance(deployment, { expectedCommitSha, projectId }) {
  const expected = normalizeExactCommitSha(expectedCommitSha);
  const expectedProjectId = String(projectId || "").trim();
  if (!expectedProjectId) throw new Error("Canonical Vercel project ID is required.");

  const identity = deploymentIdentity(deployment);
  normalizeDeploymentId(identity.deploymentId);
  if (identity.projectId !== expectedProjectId) {
    throw new Error(
      `Refusing deployment from another project: ${identity.projectId || "unknown"}.`,
    );
  }
  if (identity.target !== "production") {
    throw new Error(`Refusing non-production deployment target: ${identity.target || "unknown"}.`);
  }
  if (identity.commitRef !== "main") {
    throw new Error(`Refusing non-main deployment from ${identity.commitRef || "unknown branch"}.`);
  }
  if (!EXACT_COMMIT_SHA.test(identity.commitSha) || identity.commitSha !== expected) {
    throw new Error(
      `Refusing stale or unexpected deployment SHA ${identity.commitSha || "unknown"}; expected ${expected}.`,
    );
  }

  return { ...identity, expectedCommitSha: expected };
}

export function assertRedeploySource(deployment, options) {
  const identity = assertProductionDeploymentProvenance(deployment, options);
  if (!REDEPLOY_SOURCE_STATES.has(identity.state)) {
    throw new Error(
      `Refusing nonterminal redeploy source state ${identity.state || "unknown"}; expected ERROR or READY.`,
    );
  }
  return identity;
}

export function assertReadyProductionDeployment(deployment, { canonicalAlias, ...options }) {
  const identity = assertProductionDeploymentProvenance(deployment, options);
  if (identity.state !== "READY" || identity.aliasError) {
    throw new Error(
      `Refusing deployment that is not cleanly READY: ${identity.state || "unknown"}${
        identity.aliasError ? " with alias error" : ""
      }.`,
    );
  }

  const expectedAlias = normalizeAliasHost(canonicalAlias);
  if (!expectedAlias || !identity.aliasHosts.includes(expectedAlias)) {
    throw new Error(
      `Deployment ${identity.deploymentId} does not own canonical alias ${expectedAlias || "unknown"}.`,
    );
  }
  return identity;
}
