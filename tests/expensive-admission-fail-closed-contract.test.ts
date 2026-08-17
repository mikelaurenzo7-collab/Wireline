import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/middleware/api-rate-limits.ts"),
  "utf8",
);

describe("expensive admission boundaries", () => {
  it("fails the authenticated or cron job sweep closed behind one canonical cron bucket", () => {
    const start = source.indexOf("export const jobsSweepRateLimit");
    const end = source.indexOf("export const tcpaRateLimit", start);
    const declarationStart = source.indexOf("const JOBS_SWEEP_WINDOW_MS");
    const block = source.slice(declarationStart, end);

    expect(start).toBeGreaterThan(-1);
    expect(declarationStart).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("distributedLimiterStatus()");
    expect(block).toContain("failClosedOnError: true");
    expect(block).toContain('JOBS_SWEEP_CRON_KEY = "cron:wireline-job-sweep"');
    expect(block).toContain('sweepMode === "cron" ? JOBS_SWEEP_CRON_KEY : null');
    expect(block).not.toContain('`cron:${req.ip');
    expect(block).toContain("job sweep limiter unavailable, failing closed");
    expect(block).toContain("job sweep rate limiter error, failing closed");
    expect(block).toContain("res.status(503).json");
    expect(block).not.toContain("rate limiter error, fail-open");
  });

  it("fails remaining paid-provider admission buckets closed on limiter outage", () => {
    const files = {
      "src/routes/qa-routes-v2.ts": 'bucket: "api:qa"',
      "src/routes/insights-routes.ts": 'bucket: "api:insights-ai"',
      "src/routes/daily-brief-routes.ts": 'bucket: "api:daily-brief-send-now"',
      "src/routes/openai-realtime-routes.ts": 'bucket: "api:openai-realtime"',
      "src/routes/grok-voice-routes.ts": 'bucket: "api:live-voice-session"',
      "src/routes/video-presenter-routes-base.ts": 'bucket: "api:video-presenter-session"',
    } as const;

    for (const [path, bucket] of Object.entries(files)) {
      const contents = readFileSync(resolve(process.cwd(), path), "utf8");
      const start = contents.indexOf(bucket);
      expect(start, path).toBeGreaterThan(-1);
      const block = contents.slice(Math.max(0, start - 80), start + 180);
      expect(block, path).toContain("failClosedOnError: true");
    }

    const preview = readFileSync(resolve(process.cwd(), "src/routes/grok-voice-routes.ts"), "utf8");
    const previewStart = preview.indexOf('bucket: "api:voice-preview"');
    expect(preview.slice(previewStart, previewStart + 160)).toContain("failClosedOnError: true");
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
