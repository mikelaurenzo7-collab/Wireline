/**
 * Standardized API error handling for Wireline.
 * ---------------------------------------------------------------------------
 * All API routes should throw AppError instances (or let the global handler
 * catch raw errors) so that every response follows the same shape:
 *   { error: string, code: string, requestId?: string, details?: object }
 *
 * This replaces the ad-hoc mix of `{ error: "..." }`, `{ message: "..." }`,
 * and leaked stack traces across the 50 route files.
 */

import type { NextFunction, Request, Response } from "express";

/** Default `code` values when legacy handlers omit them (see normalize-api-error-response). */
export const HTTP_STATUS_ERROR_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION_ERROR",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export class AppError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Compatibility alias for integrations that use an HTTP-style statusCode property. */
  get statusCode(): number {
    return this.status;
  }

  /* ── Common factory methods ──────────────────────────────────────── */

  static badRequest(message: string, details?: Record<string, unknown>) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Authentication required") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Access denied") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Resource not found") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message: string, details?: Record<string, unknown>) {
    return new AppError(409, "CONFLICT", message, details);
  }

  static tooManyRequests(message = "Rate limit exceeded") {
    return new AppError(429, "RATE_LIMITED", message);
  }

  static internal(message = "Internal server error") {
    return new AppError(500, "INTERNAL_ERROR", message);
  }

  static serviceUnavailable(message: string) {
    return new AppError(503, "SERVICE_UNAVAILABLE", message);
  }

  /** Map HTTP status + message for legacy route migrations. */
  static fromHttpStatus(
    status: number,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    const code = HTTP_STATUS_ERROR_CODES[status] ?? (status >= 500 ? "INTERNAL_ERROR" : "ERROR");
    if (status === 401 && (message === "Unauthorized" || message === "Authentication required")) {
      return AppError.unauthorized(message === "Authentication required" ? message : undefined);
    }
    return new AppError(status, code, message, details);
  }
}

/** Re-throw AppError instances unchanged; use at the top of route catch blocks. */
export function rethrowIfAppError(err: unknown): void {
  if (err instanceof AppError) throw err;
}

/** Send a standardized error JSON body (prefer `throw` + global handler in async routes). */
export function sendError(res: Response, err: AppError, requestId?: string): void {
  const { status, body } = formatErrorResponse(err, requestId ?? (res.locals?.requestId as string));
  res.status(status).json(body);
}

/** Standard error response shape for all API endpoints. */
export interface ApiErrorResponse {
  error: string;
  code: string;
  requestId?: string;
  details?: Record<string, unknown>;
}

/**
 * Format any error into the standard response shape.
 * - AppError instances are preserved with their status and code.
 * - Unknown errors never leak stack traces or implementation details
 *   (500 responses always show "Internal server error").
 */
export function formatErrorResponse(
  err: unknown,
  requestId?: string,
): { status: number; body: ApiErrorResponse } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: err.message,
        code: err.code,
        ...(requestId ? { requestId } : {}),
        ...(err.details ? { details: err.details } : {}),
      },
    };
  }

  // Unknown error — never leak stack traces or implementation details.
  const isKnownHttpError =
    err instanceof Error &&
    "status" in err &&
    typeof (err as unknown as { status: unknown }).status === "number";
  const status: number = isKnownHttpError ? (err as unknown as { status: number }).status : 500;
  const safeStatus = status >= 400 && status < 600 ? status : 500;

  return {
    status: safeStatus,
    body: {
      error:
        safeStatus === 500
          ? "Internal server error"
          : err instanceof Error
            ? err.message
            : "Unknown error",
      code: safeStatus === 500 ? "INTERNAL_ERROR" : "ERROR",
      ...(requestId ? { requestId } : {}),
    },
  };
}

/**
 * Wrap an async Express handler so any rejected promise (e.g. a thrown
 * {@link AppError}) is forwarded to `next()` instead of becoming an
 * unhandled rejection.
 *
 * Without this, an `async (req, res) => { throw AppError.badRequest(...) }`
 * handler rejects silently — Express never sees the error, the request hangs
 * until the socket times out, and the response never flows through the global
 * error handler / audit path. Wrapping the handler routes every thrown error
 * to the standard `{ error, code, requestId }` response shape.
 *
 *   router.get("/api/thing", authenticateUser, asyncHandler(async (req, res) => {
 *     if (!req.user) throw AppError.unauthorized();
 *     res.json({ ok: true });
 *   }));
 */
export function asyncHandler<Req extends Request = Request, Res extends Response = Response>(
  handler: (req: Req, res: Res, next: NextFunction) => unknown | Promise<unknown>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    void Promise.resolve(handler(req as Req, res as Res, next)).catch(next);
  };
}
