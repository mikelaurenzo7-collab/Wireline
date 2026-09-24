import type { RequestHandler } from "express";
import { deploymentSourceCommit, getDeploymentIdentity } from "../lib/deployment-environment";

export function requiresRenderDeploymentGate(env = process.env): boolean {
  const provider = getDeploymentIdentity(env).provider;
  return provider === "render" || provider === "conflict";
}

export function renderTrafficEnabled(env = process.env): boolean {
  const identity = getDeploymentIdentity(env);
  return (
    identity.provider === "render" &&
    identity.environment === "production" &&
    identity.branch === "main" &&
    Boolean(identity.sourceCommit) &&
    env.BOTBOUND_TRAFFIC_ENABLED === "true"
  );
}

/** Keep the Render candidate closed until its verified production release is enabled. */
export const requireRenderTraffic: RequestHandler = (req, res, next) => {
  if (!requiresRenderDeploymentGate()) return next();

  res.setHeader("Cache-Control", "no-store");
  if ((req.method === "GET" || req.method === "HEAD") && req.path === "/healthz") {
    res.json({
      alive: true,
      trafficEnabled: renderTrafficEnabled(),
      sourceCommit: deploymentSourceCommit(),
    });
    return;
  }

  if (!renderTrafficEnabled()) {
    res.status(503).json({
      error: "BotBound is not accepting traffic on this deployment.",
      code: "DEPLOYMENT_TRAFFIC_DISABLED",
    });
    return;
  }

  next();
};
