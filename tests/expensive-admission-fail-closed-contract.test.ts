import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/middleware/api-rate-limits.ts"),
  "utf8",
);

describe("expensive admission boundaries", () => {
  it("fails the authenticated or cron job sweep closed when distributed limiting is unavailable", () => {
    const start = source.indexOf("export const jobsSweepRateLimit");
    const end = source.indexOf("export const tcpaRateLimit", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("distributedLimiterStatus()");
    expect(block).toContain("failClosedOnError: true");
    expect(block).toContain("job sweep limiter unavailable, failing closed");
    expect(block).toContain("job sweep rate limiter error, failing closed");
    expect(block).toContain("res.status(503).json");
    expect(block).not.toContain("rate limiter error, fail-open");
  });

  it("lets IP-keyed public routes opt into fail-closed admission without breaking signed webhooks", () => {
    const start = source.indexOf("interface IpRateLimiterOpts");
    const block = source.slice(start);

    expect(block).toContain("failClosedOnError?: boolean");
    expect(block).toContain("if (opts.failClosedOnError)");
    expect(block).toContain("failClosedOnError: opts.failClosedOnError");
    expect(block).toContain("ip rate limiter unavailable, failing closed");
    expect(block).toContain("ip rate limiter error, failing closed");
    expect(block).toContain("ip rate limiter error, fail-open");
    expect(block).toContain("webhook delivery remains fail-open by default");
  });
});
