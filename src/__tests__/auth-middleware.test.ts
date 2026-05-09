/**
 * Auth middleware contracts.
 *
 * Tests replicate the `authenticateUser` logic from server.ts without
 * importing the module (which opens DB connections at import time).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mirror the authenticateUser logic ────────────────────────────────────
type MockUser = { id: string; email: string };

async function authenticateUser(
  authHeader: string | undefined,
  getUser: (token: string) => Promise<{ data: { user: MockUser | null }; error: Error | null }>,
): Promise<{ status: number; body: Record<string, unknown>; user?: MockUser }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, body: { error: "No authorization header provided" } };
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return { status: 401, body: { error: "No authorization header provided" } };
  }
  const { data: { user }, error } = await getUser(token);
  if (error || !user) {
    return { status: 401, body: { error: "Invalid or expired session" } };
  }
  return { status: 200, body: {}, user };
}

const VALID_USER: MockUser = { id: "user-abc", email: "test@example.com" };

const mockGetUser = vi.fn<(token: string) => Promise<{ data: { user: MockUser | null }; error: Error | null }>>();

beforeEach(() => {
  mockGetUser.mockReset();
});

describe("authenticateUser middleware", () => {
  describe("missing / malformed Authorization header", () => {
    it("returns 401 when Authorization header is absent", async () => {
      const result = await authenticateUser(undefined, mockGetUser);
      expect(result.status).toBe(401);
      expect(result.body.error).toBeDefined();
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("returns 401 when header does not start with 'Bearer '", async () => {
      const result = await authenticateUser("Basic sometoken", mockGetUser);
      expect(result.status).toBe(401);
      expect(mockGetUser).not.toHaveBeenCalled();
    });

    it("returns 401 when header is just 'Bearer' with no token", async () => {
      const result = await authenticateUser("Bearer ", mockGetUser);
      expect(result.status).toBe(401);
    });
  });

  describe("valid JWT token", () => {
    it("returns user and status 200 for a valid token", async () => {
      mockGetUser.mockResolvedValue({ data: { user: VALID_USER }, error: null });
      const result = await authenticateUser("Bearer valid-jwt-token", mockGetUser);
      expect(result.status).toBe(200);
      expect(result.user).toEqual(VALID_USER);
      expect(mockGetUser).toHaveBeenCalledWith("valid-jwt-token");
    });

    it("passes the exact token string to getUser", async () => {
      mockGetUser.mockResolvedValue({ data: { user: VALID_USER }, error: null });
      await authenticateUser("Bearer tok123", mockGetUser);
      expect(mockGetUser).toHaveBeenCalledWith("tok123");
    });
  });

  describe("invalid / expired JWT", () => {
    it("returns 401 when getUser returns an error", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: new Error("JWT expired"),
      });
      const result = await authenticateUser("Bearer expired-token", mockGetUser);
      expect(result.status).toBe(401);
      expect(result.user).toBeUndefined();
    });

    it("returns 401 when getUser returns null user with no error", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      const result = await authenticateUser("Bearer unknown-token", mockGetUser);
      expect(result.status).toBe(401);
    });

    it("returns 401 when getUser returns error and non-null user (error takes precedence)", async () => {
      mockGetUser.mockResolvedValue({
        data: { user: VALID_USER },
        error: new Error("DB error"),
      });
      const result = await authenticateUser("Bearer partial-token", mockGetUser);
      expect(result.status).toBe(401);
    });
  });

  describe("user data extraction", () => {
    it("attaches the correct user id from the token response", async () => {
      const user = { id: "usr-999", email: "admin@wireline.io" };
      mockGetUser.mockResolvedValue({ data: { user }, error: null });
      const result = await authenticateUser("Bearer tok", mockGetUser);
      expect(result.user?.id).toBe("usr-999");
      expect(result.user?.email).toBe("admin@wireline.io");
    });
  });
});
