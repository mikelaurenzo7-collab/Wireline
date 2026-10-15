import { createServer, type Server } from "node:http";
import { readdirSync, readFileSync, statSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createUpstashRedis, UPSTASH_COMMAND_TIMEOUT_MS } from "../src/lib/upstash-redis";

let server: Server | null = null;

afterEach(async () => {
  await new Promise<void>((done) => (server ? server.close(() => done()) : done()));
  server = null;
});

async function listen(handler: Parameters<typeof createServer>[1]): Promise<number> {
  server = createServer(handler);
  await new Promise<void>((done) => server!.listen(0, "127.0.0.1", () => done()));
  return (server!.address() as AddressInfo).port;
}

describe("Upstash client", () => {
  it("gives up on an Upstash that never answers within its time budget, as an error", async () => {
    const port = await listen(() => {
      // Accept the request and never respond, like a silently dropped connection.
    });
    const redis = createUpstashRedis(`http://127.0.0.1:${port}`, "token");
    const started = Date.now();
    await expect(redis.get("rate:key")).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(UPSTASH_COMMAND_TIMEOUT_MS + 1_000);
  });

  it("fails fast when Upstash refuses the connection", async () => {
    const port = await listen(() => undefined);
    await new Promise<void>((done) => server!.close(() => done()));
    server = null;
    const redis = createUpstashRedis(`http://127.0.0.1:${port}`, "token");
    const started = Date.now();
    await expect(redis.get("rate:key")).rejects.toThrow();
    // The library default retried five times with backoff: about 4.4 seconds.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("still reads a healthy Upstash", async () => {
    const port = await listen((req, res) => {
      res.setHeader("Content-Type", "application/json");
      // The client auto-pipelines, which posts to /pipeline and expects an array.
      const reply = { result: "7" };
      res.end(JSON.stringify(req.url?.includes("pipeline") ? [reply] : reply));
    });
    const redis = createUpstashRedis(`http://127.0.0.1:${port}`, "token");
    await expect(redis.get("rate:key")).resolves.toBe(7);
  });

  it("is the only way server code builds an Upstash client", () => {
    const allowed = new Set([
      "src/lib/upstash-redis.ts",
      // Separately bundled legacy Vercel function; see public-health contract.
      "src/entrypoints/public-health-api.ts",
    ]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const file = relative(process.cwd(), path);
          if (!allowed.has(file) && readFileSync(path, "utf8").includes("new Redis(")) {
            offenders.push(file);
          }
        }
      }
    };
    walk(resolve(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
