import type { Express, NextFunction, Request, Response } from "express";
import { formatErrorResponse } from "../../src/lib/api-error";
import { normalizeApiErrorResponse } from "../../src/middleware/normalize-api-error-response";

/** Stable requestId injected in route integration tests. */
export const TEST_REQUEST_ID = "test-request-id";

/** Expected `{ error, code, requestId }` body for strict equality assertions. */
export function apiErrorBody(message: string, code: string) {
  return { error: message, code, requestId: TEST_REQUEST_ID };
}

/** Attach requestId + legacy JSON normalization (must run before routes). */
export function mountRouteTestRequestContext(app: Express): void {
  app.use((req, res, next) => {
    res.locals.requestId = TEST_REQUEST_ID;
    next();
  });
  app.use(normalizeApiErrorResponse);
}

/** Global error handler — must run after routes (mirrors server.ts). */
export function mountTestErrorHandler(app: Express, requestId = TEST_REQUEST_ID): void {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = formatErrorResponse(err, requestId);
    res.status(status).json(body);
  });
}

/** Global error handler bookend — call after mounting routes. */
export function finalizeRouteTestApp(app: Express): Express {
  mountTestErrorHandler(app);
  return app;
}
