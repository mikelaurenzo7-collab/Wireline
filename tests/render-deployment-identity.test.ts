import { describe, expect, it } from "vitest";
import {
  deploymentSourceCommit,
  getDeploymentIdentity,
  isPreviewDeployment,
  isProductionDeployment,
  type DeploymentEnvironment,
} from "../src/lib/deployment-environment";
import {
  selfServeBillingEnabled,
  selfServeBillingReleaseBlockers,
} from "../src/lib/billing-release";

const commit = "abcdef0123456789".repeat(2) + "abcdef01";
const production: DeploymentEnvironment = {
  NODE_ENV: "production",
  RENDER: "true",
  IS_PULL_REQUEST: "false",
  RENDER_GIT_BRANCH: "main",
  RENDER_GIT_COMMIT: commit,
  WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
  WIRELINE_SELF_SERVE_BILLING_ENABLED: "true",
  WIRELINE_LAUNCH_DEMO_MODE: "false",
};

describe("Render deployment identity", () => {
  it("admits an explicitly configured production release without Vercel metadata", () => {
    expect(getDeploymentIdentity(production)).toEqual({
      provider: "render",
      environment: "production",
      branch: "main",
      sourceCommit: commit,
    });
    expect(isProductionDeployment(production)).toBe(true);
    expect(isPreviewDeployment(production)).toBe(false);
    expect(selfServeBillingReleaseBlockers(production)).toEqual([]);
  });

  it("keeps pull request previews isolated despite inherited production configuration", () => {
    const preview = { ...production, IS_PULL_REQUEST: "true" };
    expect(isPreviewDeployment(preview)).toBe(true);
    expect(isProductionDeployment(preview)).toBe(false);
    expect(selfServeBillingEnabled(preview)).toBe(false);
    expect(deploymentSourceCommit(preview)).toBe(commit);
  });

  it.each([undefined, "", "staging", "typo"])(
    "requires explicit production configuration rather than NODE_ENV: %s",
    (environment) => {
      const env = { ...production, WIRELINE_DEPLOYMENT_ENVIRONMENT: environment };
      expect(isProductionDeployment(env)).toBe(false);
      expect(selfServeBillingEnabled(env)).toBe(false);
    },
  );

  it.each(["preview", "development"])("respects an explicit %s environment", (environment) => {
    const env = { ...production, WIRELINE_DEPLOYMENT_ENVIRONMENT: environment };
    expect(getDeploymentIdentity(env).environment).toBe(environment);
    expect(isProductionDeployment(env)).toBe(false);
    expect(selfServeBillingEnabled(env)).toBe(false);
  });

  it.each([undefined, "", "0", "invalid"])(
    "fails closed when pull request metadata is absent or malformed: %s",
    (pullRequest) => {
      const env = { ...production, IS_PULL_REQUEST: pullRequest };
      expect(isProductionDeployment(env)).toBe(false);
      expect(selfServeBillingEnabled(env)).toBe(false);
    },
  );

  it.each([undefined, "false", "1"])("requires valid Render host metadata: %s", (render) => {
    const env = { ...production, RENDER: render };
    expect(getDeploymentIdentity(env).provider).toBe("render");
    expect(isProductionDeployment(env)).toBe(false);
    expect(selfServeBillingEnabled(env)).toBe(false);
  });

  it("rejects mixed provider metadata instead of borrowing a valid channel or revision", () => {
    const env = {
      ...production,
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: commit,
    };
    expect(getDeploymentIdentity(env).provider).toBe("conflict");
    expect(isProductionDeployment(env)).toBe(false);
    expect(deploymentSourceCommit(env)).toBeNull();
    expect(selfServeBillingEnabled(env)).toBe(false);
  });

  it.each([undefined, "feature/release", "Main", "refs/heads/main"])(
    "refuses billing for a branch other than the exact main ref: %s",
    (branch) => {
      expect(selfServeBillingReleaseBlockers({ ...production, RENDER_GIT_BRANCH: branch })).toEqual(
        ["RENDER_GIT_BRANCH=main"],
      );
    },
  );

  it.each([undefined, "", "abcdef0", "g".repeat(40), "a".repeat(41)])(
    "requires a complete source revision for Render billing: %s",
    (revision) => {
      const env = { ...production, RENDER_GIT_COMMIT: revision };
      expect(deploymentSourceCommit(env)).toBeNull();
      expect(selfServeBillingEnabled(env)).toBe(false);
    },
  );

  it("normalizes source SHA casing without changing branch identity", () => {
    expect(
      deploymentSourceCommit({ ...production, RENDER_GIT_COMMIT: ` ${commit.toUpperCase()} ` }),
    ).toBe(commit);
  });

  it("keeps launch approval and demo classification independent of host readiness", () => {
    const unreleased = {
      ...production,
      WIRELINE_SELF_SERVE_BILLING_ENABLED: "false",
      WIRELINE_LAUNCH_DEMO_MODE: "true",
    };
    expect(isProductionDeployment(unreleased)).toBe(true);
    expect(selfServeBillingReleaseBlockers(unreleased)).toEqual([
      "WIRELINE_SELF_SERVE_BILLING_ENABLED=true",
      "WIRELINE_LAUNCH_DEMO_MODE=false",
    ]);
  });

  it("retains the Vercel rollback channel and source revision reader", () => {
    const env = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_SHA: commit,
      WIRELINE_SELF_SERVE_BILLING_ENABLED: "true",
      WIRELINE_LAUNCH_DEMO_MODE: "false",
    };
    expect(getDeploymentIdentity(env).provider).toBe("vercel");
    expect(isProductionDeployment(env)).toBe(true);
    expect(deploymentSourceCommit(env)).toBe(commit);
    expect(selfServeBillingEnabled(env)).toBe(true);
    expect(isProductionDeployment({ ...env, VERCEL_ENV: "preview" })).toBe(false);
    expect(selfServeBillingEnabled({ ...env, VERCEL_ENV: "preview" })).toBe(false);
  });

  it("preserves local production security without admitting local paid checkout", () => {
    const env = {
      NODE_ENV: "production",
      WIRELINE_SELF_SERVE_BILLING_ENABLED: "true",
      WIRELINE_LAUNCH_DEMO_MODE: "false",
    };
    expect(isProductionDeployment(env)).toBe(true);
    expect(deploymentSourceCommit(env)).toBeNull();
    expect(selfServeBillingEnabled(env)).toBe(false);
  });
});
