import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const source = read("src/routes/insights-routes.ts");

describe("insights AI rate limiting", () => {
  it("gates LLM-backed Insights endpoints behind a dedicated hourly limiter", () => {
    expect(source).toContain('import { createRateLimiter } from "../middleware/api-rate-limits"');
    expect(source).toContain('bucket: "api:insights-ai"');
    expect(source).toContain("max: 20");
    expect(source).toContain("failClosedOnError: true");
    expect(source).toContain("insightsAiRateLimit");

    for (const path of [
      "/api/insights/topics",
      "/api/insights/failure-modes",
      "/api/insights/daily-brief",
    ]) {
      const routeMatch = source.match(
        new RegExp(`router\\.get\\(\\s*"${path.replace(/\//g, "\\/")}"[\\s\\S]*?\\);`),
      );
      expect(routeMatch, path).not.toBeNull();
      expect(routeMatch![0]).toContain("authenticateUser");
      expect(routeMatch![0]).toContain("insightsAiRateLimit");
    }
  });
});
