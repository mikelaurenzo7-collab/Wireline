import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const source = read("src/routes/daily-brief-routes.ts");

describe("daily-brief send-now rate limiting", () => {
  it("gates the LLM-generation + email-send endpoint behind a dedicated limiter", () => {
    expect(source).toContain('import { createRateLimiter } from "../middleware/api-rate-limits"');
    expect(source).toContain('bucket: "api:daily-brief-send-now"');
    expect(source).toContain("max: 10");
    expect(source).toContain("failClosedOnError: true");

    const routeMatch = source.match(/router\.post\(\s*"\/api\/daily-brief\/send-now"[\s\S]*?\);/);
    expect(routeMatch).not.toBeNull();
    expect(routeMatch![0]).toContain("authenticateUser");
    expect(routeMatch![0]).toContain("sendNowRateLimit");
  });
});
