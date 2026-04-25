import { describe, expect, it, vi } from "vitest";

import { AppError, asyncHandler, errorHandler } from "./errors";

describe("AppError", () => {
  it("static factories produce the right status code and code", () => {
    expect(AppError.badRequest("bad").statusCode).toBe(400);
    expect(AppError.badRequest("bad").code).toBe("bad_request");
    expect(AppError.unauthorized().statusCode).toBe(401);
    expect(AppError.forbidden().statusCode).toBe(403);
    expect(AppError.notFound().statusCode).toBe(404);
    expect(AppError.conflict("c").statusCode).toBe(409);
    expect(AppError.tooMany().statusCode).toBe(429);
    expect(AppError.internal().statusCode).toBe(500);
  });

  it("hides 5xx details from clients by default", () => {
    expect(AppError.internal().expose).toBe(false);
    expect(AppError.badRequest("oops").expose).toBe(true);
  });
});

describe("asyncHandler", () => {
  it("forwards rejections to next()", async () => {
    const handler = asyncHandler(async () => {
      throw AppError.unauthorized();
    });
    const next = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler({} as any, {} as any, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
  });

  it("does not call next() on success", async () => {
    const handler = asyncHandler(async () => "ok");
    const next = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler({} as any, {} as any, next);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("errorHandler", () => {
  it("serializes AppErrors with their status, message, and code", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res = { status, json };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorHandler(AppError.badRequest("nope"), { path: "/x", method: "GET" } as any, res as any, vi.fn());
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "nope", code: "bad_request" })
    );
  });

  it("masks unknown errors in production-like output", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const res = { status, json };
    errorHandler(
      new Error("internal stacktrace"),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { path: "/x", method: "POST" } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res as any,
      vi.fn()
    );
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Internal Server Error" })
    );
  });
});
