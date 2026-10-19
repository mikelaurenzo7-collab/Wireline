import type { NextFunction, Request, Response } from "express";

/**
 * Shared-workspace activation is intentionally not a boolean feature flag.
 * The exact certification value documents that the tenant-id/actor-id data
 * plane and permission audit has been completed before collaboration can be
 * enabled in any environment.
 */
export const SHARED_WORKSPACE_CERTIFICATION = "shared-workspace-data-plane-v1";

export function sharedWorkspacesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WIRELINE_SHARED_WORKSPACES_CERTIFICATION === SHARED_WORKSPACE_CERTIFICATION;
}

export function requireCertifiedSharedWorkspaces(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (sharedWorkspacesEnabled()) {
    next();
    return;
  }

  res.status(503).json({
    code: "SHARED_WORKSPACES_NOT_CERTIFIED",
    error:
      "Team invitations aren't available yet. Your workspace keeps working as usual.",
  });
}
