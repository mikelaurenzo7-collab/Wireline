import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 2026-Q2 security audit — locks the claudeRateLimiter mount in place.
// /api/claude is the highest-cost surface in the app (every Anthropic call
// goes through it). A regression that drops the limiter would expose the
// entire Anthropic budget to any leaked token.
const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = readFileSync(join(__dirname, "..", "..", "server.ts"), "utf8");

describe("server.ts middleware wiring", () => {
  it("imports claudeRateLimiter", () => {
    expect(SERVER).toMatch(
      /import\s+\{[^}]*\bclaudeRateLimiter\b[^}]*\}\s+from\s+['"][^'"]*api-rate-limits['"]/,
    );
  });

  it("mounts claudeRateLimiter on /api/claude", () => {
    expect(SERVER).toMatch(/app\.use\(["']\/api\/claude["']\s*,\s*claudeRateLimiter\s*\)/);
  });

  it("mounts claudeRateLimiter BEFORE the claude router", () => {
    const limiterMount = SERVER.search(
      /app\.use\(["']\/api\/claude["']\s*,\s*claudeRateLimiter\s*\)/,
    );
    const routerMount = SERVER.search(/app\.use\(["']\/api\/claude["']\s*,\s*claudeRouter\s*\)/);
    expect(limiterMount).toBeGreaterThan(0);
    expect(routerMount).toBeGreaterThan(0);
    expect(limiterMount).toBeLessThan(routerMount);
  });

  it("imports spend-cap + audit middleware for /api/claude", () => {
    expect(SERVER).toMatch(/\bwithAudit\b/);
    expect(SERVER).toMatch(/\benforceSpendCap\b/);
    expect(SERVER).toMatch(/\benforce24hSpendCap\b/);
    expect(SERVER).toMatch(/\bauthenticateUser\b/);
  });

  it("mounts auth, audit, and spend caps on /api/claude before claudeRouter", () => {
    const authMount = SERVER.search(/app\.use\(["']\/api\/claude["']\s*,\s*authenticateUser\s*\)/);
    const auditMount = SERVER.search(/app\.use\(["']\/api\/claude["']\s*,\s*withAudit\(/);
    const dailyCapMount = SERVER.search(
      /app\.use\(["']\/api\/claude["']\s*,\s*enforce24hSpendCap\s*\)/,
    );
    const spendCapMount = SERVER.search(
      /app\.use\(["']\/api\/claude["']\s*,\s*enforceSpendCap\s*\)/,
    );
    const routerMount = SERVER.search(/app\.use\(["']\/api\/claude["']\s*,\s*claudeRouter\s*\)/);
    for (const idx of [authMount, auditMount, dailyCapMount, spendCapMount, routerMount]) {
      expect(idx).toBeGreaterThan(0);
    }
    expect(authMount).toBeLessThan(auditMount);
    expect(auditMount).toBeLessThan(dailyCapMount);
    expect(dailyCapMount).toBeLessThan(spendCapMount);
    expect(spendCapMount).toBeLessThan(routerMount);
  });

  it("mounts extended timeout on /api/director before the global API cap", () => {
    const directorTimeout = SERVER.search(
      /app\.use\(["']\/api\/director["']\s*,\s*timeoutMiddleware\(\s*180_000\s*\)\s*\)/,
    );
    const globalTimeout = SERVER.search(
      /app\.use\(["']\/api["']\s*,\s*timeoutMiddleware\(20_000\)\s*\)/,
    );
    expect(directorTimeout).toBeGreaterThan(0);
    expect(globalTimeout).toBeGreaterThan(0);
    expect(directorTimeout).toBeLessThan(globalTimeout);
  });
});
