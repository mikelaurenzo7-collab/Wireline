import type { NextFunction, Request, Response } from "express";

/**
 * Require an explicit Authorization: Bearer token before a route reaches the
 * generic session auth middleware. Use this for native/mobile APIs that are
 * intentionally cookieless and same-origin exempt.
 */
export function requireBearerAuthorization(code = "BEARER_REQUIRED") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (typeof header === "string" && /^Bearer\s+\S+/i.test(header)) {
      next();
      return;
    }

    res.status(401).json({
      error: "Authorization: Bearer token is required.",
      code,
      requestId: res.locals?.requestId,
    });
  };
}
