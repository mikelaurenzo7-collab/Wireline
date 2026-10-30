import {
  getDeploymentIdentity,
  type DeploymentEnvironment,
} from "../../src/lib/deployment-environment";
import { CANONICAL_PRODUCTION_URL } from "./production-url.mjs";

export function assertStripePortalOperatorEnvironment(
  env: DeploymentEnvironment,
  {
    apply,
    renderRelease,
  }: { apply: boolean; renderRelease?: { role?: string; revision?: string } },
) {
  const deployment = getDeploymentIdentity(env);
  if (deployment.environment !== "production") {
    throw new Error("Stripe portal verification requires an unambiguous production environment.");
  }
  if (deployment.provider === "local" && apply) {
    throw new Error(
      "Stripe portal repair requires a verified production deployment; local verification is read-only.",
    );
  }
  if (deployment.provider === "vercel") {
    throw new Error("Stripe portal reconciliation no longer supports Vercel (retired, T1).");
  }
  if (
    deployment.provider === "render" &&
    (deployment.branch !== "main" ||
      !deployment.sourceCommit ||
      renderRelease?.role !== "api" ||
      renderRelease.revision !== deployment.sourceCommit ||
      (Boolean(env.WIRELINE_SOURCE_REVISION) &&
        env.WIRELINE_SOURCE_REVISION !== deployment.sourceCommit))
  ) {
    throw new Error(
      "Stripe portal reconciliation requires a verified Render production main release.",
    );
  }
  const appUrl = env.APP_URL?.trim().replace(/\/+$/, "") || "";
  if (appUrl !== CANONICAL_PRODUCTION_URL) {
    throw new Error(`Stripe portal reconciliation requires APP_URL=${CANONICAL_PRODUCTION_URL}.`);
  }
  const secretKey = env.STRIPE_SECRET_KEY?.trim() || "";
  if (!/^(?:sk|rk)_live_/.test(secretKey)) {
    throw new Error("Stripe portal reconciliation requires the live Production Stripe key.");
  }
  return { appUrl, secretKey };
}
