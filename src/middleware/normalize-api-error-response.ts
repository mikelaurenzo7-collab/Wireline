/**
 * Ensures every JSON error response on /api includes `code` (+ requestId when set).
 * Legacy routes that still call res.status(4xx).json({ error: "..." }) get normalized
 * at runtime while we migrate them to throw AppError.
 */
import type { NextFunction, Request, Response } from "express";
import { HTTP_STATUS_ERROR_CODES } from "../lib/api-error";

function isErrorJsonBody(body: unknown): body is Record<string, unknown> {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof (body as Record<string, unknown>).error === "string"
  );
}

function normalizeErrorBody(
  statusCode: number,
  body: Record<string, unknown>,
  requestId?: string,
): Record<string, unknown> {
  if (typeof body.code === "string" && body.code.length > 0) {
    return requestId && !body.requestId ? { ...body, requestId } : body;
  }
  const code =
    HTTP_STATUS_ERROR_CODES[statusCode] ?? (statusCode >= 500 ? "INTERNAL_ERROR" : "ERROR");
  return {
    ...body,
    code,
    ...(requestId && !body.requestId ? { requestId } : {}),
  };
}

export function normalizeApiErrorResponse(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const origJson = res.json.bind(res);
  res.json = function jsonWithNormalizedErrors(body?: unknown) {
    const statusCode = res.statusCode || 200;
    if (statusCode >= 400 && isErrorJsonBody(body)) {
      const requestId = res.locals?.requestId as string | undefined;
      return origJson(normalizeErrorBody(statusCode, body, requestId));
    }
    return origJson(body);
  };

  next();
}
