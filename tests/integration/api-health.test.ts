import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("API integration smoke", () => {
  let server: Server | undefined;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.VERCEL = "1";
    const { app } = await import("../../server");
    server = createServer(app);
    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const addr = server!.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }, 120_000);

  afterAll(async () => {
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

  it("GET /api/health/public responds without server error", async () => {
    const res = await fetch(`${baseUrl}/api/health/public`);
    expect(res.status).toBeLessThan(500);
  });
});
