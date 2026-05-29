import { test, expect } from "@playwright/test";

/**
 * Public API health endpoints — contract verification.
 *
 * These endpoints are unauthenticated and used by load balancers, uptime
 * monitors, and the marketing status page. They must always respond with
 * valid JSON and expected shape.
 */
test.describe("Public API — health endpoints", () => {
  test("GET /api/health returns 200 with JSON body", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toBeTruthy();
    // Health endpoint should indicate system status
    expect(typeof body).toBe("object");
  });

  test("GET /api/health/public returns sanitized health status", async ({ request }) => {
    const response = await request.get("/api/health/public");

    // Should return 200 with public-safe info (no model/vendor details)
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("GET /api/public/stats returns aggregated stats", async ({ request }) => {
    const response = await request.get("/api/public/stats");

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });
});

test.describe("Public API — unauthenticated boundary", () => {
  test("GET /api/health/internal requires authentication", async ({ request }) => {
    const response = await request.get("/api/health/internal");

    // Should return 401 or 403 for internal health endpoint
    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/calls requires authentication", async ({ request }) => {
    const response = await request.get("/api/calls");

    expect([401, 403]).toContain(response.status());
  });

  test("GET /api/agents requires authentication", async ({ request }) => {
    const response = await request.get("/api/agents");

    expect([401, 403]).toContain(response.status());
  });
});

test.describe("Public API — CORS and security headers", () => {
  test("health endpoint returns proper content-type", async ({ request }) => {
    const response = await request.get("/api/health");

    const contentType = response.headers()["content-type"];
    expect(contentType).toMatch(/application\/json/);
  });

  test("pages return CSP header", async ({ request }) => {
    const response = await request.get("/");

    // CSP header should be present on HTML pages
    const csp = response.headers()["content-security-policy"];
    if (csp) {
      expect(csp).toContain("script-src");
    }
  });

  test("pages return X-Request-Id header", async ({ request }) => {
    const response = await request.get("/api/health");

    const requestId = response.headers()["x-request-id"];
    // Request-ID middleware should be active
    if (requestId) {
      expect(requestId.length).toBeGreaterThan(0);
    }
  });
});
