import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("API integration smoke", () => {
  let server: Server | undefined;
  let baseUrl: string;
  let previousRedisUrl: string | undefined;
  let previousRedisToken: string | undefined;

  beforeAll(async () => {
    process.env.VERCEL = "1";
    previousRedisUrl = process.env.UPSTASH_REDIS_REST_URL;
    previousRedisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const { app } = await import("../../server");
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const addr = server!.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 120_000);

  afterAll(async () => {
    if (previousRedisUrl === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previousRedisUrl;
    if (previousRedisToken === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previousRedisToken;

    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /api/health responds with honest JSON (not opaque 500)", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBeLessThan(600);
    const body = await res.json();
    expect(body).toHaveProperty("ok");
  });

  it("GET /api/health/public fails closed without distributed coordination", async () => {
    const res = await fetch(`${baseUrl}/api/health/public`);
    expect(res.status).toBe(503);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toMatchObject({
      overall: "degraded",
      code: "DISTRIBUTED_CACHE_REQUIRED",
    });
  });
});
