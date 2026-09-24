import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireRenderTraffic, renderTrafficEnabled } from "../src/middleware/render-traffic";

let server: Server;
let url: string;
let downstreamCalls: number;

beforeEach(async () => {
  for (const key of ["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_COMMIT_SHA"])
    vi.stubEnv(key, "");
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("IS_PULL_REQUEST", "false");
  vi.stubEnv("WIRELINE_DEPLOYMENT_ENVIRONMENT", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("RENDER_GIT_COMMIT", "b".repeat(40));
  vi.stubEnv("BOTBOUND_TRAFFIC_ENABLED", "false");
  downstreamCalls = 0;
  const app = express();
  app.set("trust proxy", 1);
  app.use(requireRenderTraffic);
  app.use((req, res) => {
    downstreamCalls += 1;
    res.json({ ip: req.ip });
  });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  vi.unstubAllEnvs();
});

describe("Render deployment traffic gate", () => {
  it("serves non-probing liveness while traffic is disabled", async () => {
    const response = await fetch(`${url}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      alive: true,
      trafficEnabled: false,
      sourceCommit: "b".repeat(40),
    });
    expect(downstreamCalls).toBe(0);
    expect((await fetch(`${url}/api/health/public`)).status).toBe(503);
  });
  it("rejects disabled production traffic before downstream handlers", async () => {
    const response = await fetch(url);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "DEPLOYMENT_TRAFFIC_DISABLED" });
    expect(downstreamCalls).toBe(0);
  });
  it("accepts enabled main releases directly and uses the closest proxy's client IP", async () => {
    vi.stubEnv("BOTBOUND_TRAFFIC_ENABLED", "true");
    const response = await fetch(url, {
      headers: {
        "x-forwarded-for": "127.0.0.1, 203.0.113.4",
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ip: "203.0.113.4" });
  });
  it.each([
    ["IS_PULL_REQUEST", "true"],
    ["RENDER_GIT_BRANCH", "codex/migration"],
    ["RENDER_GIT_COMMIT", "unknown"],
    ["WIRELINE_DEPLOYMENT_ENVIRONMENT", "preview"],
    ["VERCEL_ENV", "production"],
    ["RENDER", ""],
  ])("cannot open a non-certified runtime through %s", async (key, value) => {
    vi.stubEnv("BOTBOUND_TRAFFIC_ENABLED", "true");
    vi.stubEnv(key, value);
    expect(renderTrafficEnabled()).toBe(false);
    expect((await fetch(url)).status).toBe(503);
    expect(downstreamCalls).toBe(0);
  });
});
