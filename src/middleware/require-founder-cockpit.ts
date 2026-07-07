import type { NextFunction, Request, Response } from "express";
import { canAccessFounderCockpit } from "../lib/founder-cockpit-access";
import { AppError } from "../lib/api-error";
import { auditLogger, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";

type CockpitUser = { id?: string; email?: string };

/**
 * Gates founder-only cockpit APIs. Stricter than platform admin — no is_admin bypass.
 */
export function requireFounderCockpit(req: Request, _res: Response, next: NextFunction): void {
  const user = (req as Request & { user?: CockpitUser }).user;
  if (!user?.id) {
    next(AppError.unauthorized());
    return;
  }
  if (!canAccessFounderCockpit(user)) {
    void auditLogger
      .logSecurity("unauthorized_access", {
        userId: user.id,
        resource: `${req.method} ${req.path}`,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { scope: "founder_cockpit" },
      })
      .catch((e: unknown) => log.warn("audit log failed", { error: getErrorMessage(e) }));
    next(AppError.forbidden("Founder cockpit access required"));
    return;
  }
  next();
}
