import { test, expect } from "@playwright/test";

/**
 * Fast API smoke against the same dev server as UI tests (uses baseURL from playwright.config).
 */
test.describe("Public API contracts", () => {
  test("GET /api/health returns JSON status", async ({ request }) => {
    const res = await request.get("/api/health");
    expect([200, 503]).toContain(res.status());
    const body = await res.json().catch(() => null);
    expect(body && typeof (body as { status?: unknown }).status === "string").toBeTruthy();
  });

  test("GET /api/billing/plans returns plan list", async ({ request }) => {
    const res = await request.get("/api/billing/plans");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.plans)).toBeTruthy();
  });

  test("GET /api/openapi.json is OpenAPI 3.1", async ({ request }) => {
    const res = await request.get("/api/openapi.json");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
  });
});
