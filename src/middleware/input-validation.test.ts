import { describe, expect, it } from "vitest";
import { z } from "zod";
import { validate } from "./input-validation";
import { AppError } from "../lib/api-error";

// Minimal Express-like mocks
function mockReq(overrides: { body?: unknown; params?: unknown; query?: unknown } = {}) {
  return {
    body: overrides.body ?? {},
    params: overrides.params ?? {},
    query: overrides.query ?? {},
  } as any;
}

const mockRes = {} as any;

describe("input-validation middleware", () => {
  const bodySchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
  });

  const paramsSchema = z.object({
    id: z.string().uuid(),
  });

  const querySchema = z.object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  });

  it("passes valid body through to next()", () => {
    const mw = validate({ body: bodySchema });
    const req = mockReq({ body: { name: "Test Agent", email: "test@example.com" } });
    let called = false;
    mw(req, mockRes, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("throws AppError on invalid body", () => {
    const mw = validate({ body: bodySchema });
    const req = mockReq({ body: { name: "", email: "not-an-email" } });
    expect(() => mw(req, mockRes, () => {})).toThrow(AppError);
  });

  it("AppError contains structured field errors for body", () => {
    const mw = validate({ body: bodySchema });
    const req = mockReq({ body: { name: "", email: "bad" } });
    try {
      mw(req, mockRes, () => {});
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.status).toBe(400);
      expect(appErr.details).toHaveProperty("body");
      expect((appErr.details as any).body.length).toBeGreaterThan(0);
    }
  });

  it("validates params and rejects invalid UUIDs", () => {
    const mw = validate({ params: paramsSchema });
    const req = mockReq({ params: { id: "not-a-uuid" } });
    expect(() => mw(req, mockRes, () => {})).toThrow(AppError);
  });

  it("passes valid params", () => {
    const mw = validate({ params: paramsSchema });
    const req = mockReq({ params: { id: "550e8400-e29b-41d4-a716-446655440000" } });
    let called = false;
    mw(req, mockRes, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("validates query parameters", () => {
    const mw = validate({ query: querySchema });
    const req = mockReq({ query: { page: "-1" } });
    expect(() => mw(req, mockRes, () => {})).toThrow(AppError);
  });

  it("passes valid query parameters", () => {
    const mw = validate({ query: querySchema });
    const req = mockReq({ query: { page: "2", limit: "50" } });
    let called = false;
    mw(req, mockRes, () => {
      called = true;
    });
    expect(called).toBe(true);
  });

  it("validates body + params + query simultaneously", () => {
    const mw = validate({ body: bodySchema, params: paramsSchema, query: querySchema });
    const req = mockReq({
      body: { name: "", email: "bad" },
      params: { id: "bad" },
      query: { page: "-1" },
    });
    try {
      mw(req, mockRes, () => {});
      expect.fail("should have thrown");
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.details).toHaveProperty("body");
      expect(appErr.details).toHaveProperty("params");
      expect(appErr.details).toHaveProperty("query");
    }
  });

  it("does not throw when no schemas provided", () => {
    const mw = validate({});
    const req = mockReq({ body: { anything: "goes" } });
    let called = false;
    mw(req, mockRes, () => {
      called = true;
    });
    expect(called).toBe(true);
  });
});
