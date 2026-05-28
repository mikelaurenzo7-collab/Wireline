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
});
