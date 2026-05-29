import { describe, expect, it } from "vitest";
import { AppError, formatErrorResponse } from "./api-error";

describe("AppError", () => {
  it("creates a bad request error", () => {
    const err = AppError.badRequest("Invalid email");
    expect(err.status).toBe(400);
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Invalid email");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it("creates an unauthorized error with default message", () => {
    const err = AppError.unauthorized();
    expect(err.status).toBe(401);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.message).toBe("Authentication required");
  });

  it("creates a forbidden error", () => {
    const err = AppError.forbidden("No access to billing");
    expect(err.status).toBe(403);
    expect(err.code).toBe("FORBIDDEN");
    expect(err.message).toBe("No access to billing");
  });

  it("creates a not found error", () => {
    const err = AppError.notFound("Agent not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("creates a conflict error with details", () => {
    const err = AppError.conflict("Email already exists", { field: "email" });
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT");
    expect(err.details).toEqual({ field: "email" });
  });

  it("creates a rate limit error", () => {
    const err = AppError.tooManyRequests();
    expect(err.status).toBe(429);
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("creates an internal server error", () => {
    const err = AppError.internal();
    expect(err.status).toBe(500);
    expect(err.code).toBe("INTERNAL_ERROR");
  });

  it("creates a service unavailable error", () => {
    const err = AppError.serviceUnavailable("Database down");
    expect(err.status).toBe(503);
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("preserves stack trace", () => {
    const err = AppError.internal();
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain("api-error.test.ts");
  });
});

describe("formatErrorResponse", () => {
  it("formats AppError with all fields", () => {
    const err = AppError.badRequest("Invalid input", { field: "name" });
    const { status, body } = formatErrorResponse(err, "req-123");
    expect(status).toBe(400);
    expect(body.error).toBe("Invalid input");
    expect(body.code).toBe("BAD_REQUEST");
    expect(body.requestId).toBe("req-123");
    expect(body.details).toEqual({ field: "name" });
  });

  it("formats AppError without requestId", () => {
    const err = AppError.notFound();
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(404);
    expect(body.requestId).toBeUndefined();
  });

  it("formats unknown Error as 500 without leaking details", () => {
    const err = new Error("SECRET: database connection string leaked");
    const { status, body } = formatErrorResponse(err, "req-456");
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.error).not.toContain("SECRET");
    expect(body.requestId).toBe("req-456");
  });

  it("formats non-Error values as 500", () => {
    const { status, body } = formatErrorResponse("just a string");
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });

  it("respects HTTP status on Error-like objects", () => {
    const err = Object.assign(new Error("Not allowed"), { status: 403 });
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(403);
    expect(body.error).toBe("Not allowed");
  });

  it("clamps invalid status codes to 500", () => {
    const err = Object.assign(new Error("weird"), { status: 200 });
    const { status, body } = formatErrorResponse(err);
    expect(status).toBe(500);
    expect(body.error).toBe("Internal server error");
  });
});
