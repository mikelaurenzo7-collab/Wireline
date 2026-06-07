import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../types/auth";

vi.mock("../../lib/auth-service", () => ({
  isOwnerEmail: vi.fn((email: string | null | undefined) => email === "mikelaurenzo7@gmail.com"),
}));

import { authorizeMigration } from "./auth";

function mockRes(): Response {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as Response;
}

describe("authorizeMigration", () => {
  beforeEach(() => {
    vi.stubEnv("MIGRATION_TOKEN", "");
  });

  it("allows the platform owner email (case-insensitive via isOwnerEmail)", () => {
    const req = {
      headers: {},
      user: { id: "u1", email: "mikelaurenzo7@gmail.com" },
    } as AuthenticatedRequest;
    const res = mockRes();
    expect(authorizeMigration(req, res)).toBe(true);
  });

  it("denies non-owner authenticated users", () => {
    const req = {
      headers: {},
      user: { id: "u2", email: "onboarding.browser.test@trywireline.com" },
    } as AuthenticatedRequest;
    const res = mockRes();
    expect(authorizeMigration(req, res)).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
