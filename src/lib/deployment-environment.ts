export type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

export type DeploymentIdentity = Readonly<{
  provider: "vercel" | "render" | "local" | "conflict";
  environment: string;
  branch: string | null;
  sourceCommit: string | null;
}>;

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() || "";
}

function sourceCommit(value: string | undefined): string | null {
  const commit = normalized(value);
  return /^[a-f0-9]{40}$/.test(commit) ? commit : null;
}

/**
 * Render sets NODE_ENV=production for previews too. Its production channel
 * therefore requires explicit application configuration plus non-preview host
 * metadata. Never borrow a branch, revision, or environment from another host.
 * Vercel and local classification retain their existing precedence for rollback.
 */
export function getDeploymentIdentity(
  env: DeploymentEnvironment = process.env,
): DeploymentIdentity {
  const render = ["RENDER", "RENDER_SERVICE_ID", "RENDER_GIT_BRANCH", "RENDER_GIT_COMMIT"].some(
    (key) => Boolean(env[key]?.trim()),
  );
  const vercel = ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_SHA"].some(
    (key) => Boolean(env[key]?.trim()),
  );

  if (render && vercel) {
    return { provider: "conflict", environment: "unknown", branch: null, sourceCommit: null };
  }

  if (render) {
    const configured = normalized(env.WIRELINE_DEPLOYMENT_ENVIRONMENT);
    const pullRequest = normalized(env.IS_PULL_REQUEST);
    const validHost = normalized(env.RENDER) === "true";
    const environment =
      validHost && pullRequest === "true"
        ? "preview"
        : validHost &&
            pullRequest === "false" &&
            ["production", "preview", "development"].includes(configured)
          ? configured
          : "unknown";
    return {
      provider: "render",
      environment,
      branch: env.RENDER_GIT_BRANCH?.trim() || null,
      sourceCommit: sourceCommit(env.RENDER_GIT_COMMIT),
    };
  }

  if (vercel) {
    return {
      provider: "vercel",
      environment: normalized(env.VERCEL_ENV) || normalized(env.NODE_ENV) || "unknown",
      branch: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
      sourceCommit: sourceCommit(env.VERCEL_GIT_COMMIT_SHA),
    };
  }

  return {
    provider: "local",
    environment: normalized(env.NODE_ENV) || "local",
    branch: null,
    sourceCommit: null,
  };
}

export function deploymentSourceCommit(env: DeploymentEnvironment = process.env): string | null {
  return getDeploymentIdentity(env).sourceCommit;
}

export function isProductionDeployment(env: DeploymentEnvironment = process.env): boolean {
  return getDeploymentIdentity(env).environment === "production";
}

export function isPreviewDeployment(env: DeploymentEnvironment = process.env): boolean {
  return getDeploymentIdentity(env).environment === "preview";
}
