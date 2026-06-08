import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { normalizeApiErrorResponse } from "./normalize-api-error-response";

function mockRes(statusCode = 400) {
  const json = vi.fn();
  const res = {
    statusCode,
    locals: { requestId: "req-test-1" },
    json,
  } as unknown as Response;
  return { res, json };
}

describe("normalizeApiErrorResponse", () => {
  it("adds code and requestId to legacy { error } bodies on /api", () => {
    const req = { path: "/api/foo" } as Request;
    const { res, json } = mockRes(404);
    const next = vi.fn();

    normalizeApiErrorResponse(req, res, next);
    expect(next).toHaveBeenCalled();

    res.json({ error: "Not found" });
    expect(json).toHaveBeenCalledWith({
      error: "Not found",
      code: "NOT_FOUND",
      requestId: "req-test-1",
    });
  });

  it("does not mutate bodies that already include code", () => {
    const req = { path: "/api/foo" } as Request;
    const { res, json } = mockRes(400);
    normalizeApiErrorResponse(req, res, vi.fn());

    res.json({ error: "Bad", code: "VALIDATION_ERROR", details: [] });
    expect(json).toHaveBeenCalledWith({
      error: "Bad",
      code: "VALIDATION_ERROR",
      details: [],
      requestId: "req-test-1",
    });
  });

  it("skips non-/api paths", () => {
    const req = { path: "/signin" } as Request;
    const { res, json } = mockRes(400);
    const next = vi.fn();

    normalizeApiErrorResponse(req, res, next);
    res.json({ error: "nope" });
    expect(json).toHaveBeenCalledWith({ error: "nope" });
  });
});
