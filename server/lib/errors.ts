/**
 * Typed application errors + an asyncHandler wrapper that funnels rejections
 * into the central error middleware. Replaces the per-route try/catch noise
 * scattered across the original monolithic server file.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { logger } from "./logger";
import { isProductionEnv } from "./env";

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { details?: unknown; expose?: boolean; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause as Error | undefined });
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.expose = options.expose ?? statusCode < 500;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "bad_request", message, { details });
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(401, "unauthorized", message);
  }

  static forbidden(message = "Forbidden") {
    return new AppError(403, "forbidden", message);
  }

  static notFound(message = "Not found") {
    return new AppError(404, "not_found", message);
  }

  static conflict(message: string) {
    return new AppError(409, "conflict", message);
  }

  static tooMany(message = "Too many requests") {
    return new AppError(429, "too_many_requests", message);
  }

  static internal(message = "Internal Server Error", cause?: unknown) {
    return new AppError(500, "internal_error", message, { cause, expose: false });
  }
}

export function asyncHandler<R extends Request = Request>(
  fn: (req: R, res: Response, next: NextFunction) => Promise<unknown> | unknown
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req as R, res, next)).catch(next);
  };
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, "Request failed");
    } else {
      logger.warn({ err: err.message, path: req.path, method: req.method }, "Request rejected");
    }
    return res.status(err.statusCode).json({
      error: err.expose ? err.message : "An unexpected error occurred.",
      code: err.code,
      ...(err.details && err.expose ? { details: err.details } : {}),
    });
  }

  const errorObj = err as Error;
  logger.error({ err: errorObj, path: req.path, method: req.method }, "Unhandled error");
  res.status(500).json({
    error: "Internal Server Error",
    message: isProductionEnv() ? "An unexpected error occurred." : errorObj?.message,
  });
}
