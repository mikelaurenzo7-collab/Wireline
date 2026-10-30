import express from "express";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  productionStaticHeaders,
  registerLegacyContentRedirects,
  registerProductionStaticAliases,
  rejectMissingPublicResource,
  setPublicIsolationHeaders,
} from "../src/server/register-production-static-aliases";

let fixture: string;
let server: Server;
let origin: string;

beforeEach(async () => {
  fixture = mkdtempSync(join(tmpdir(), "botbound-static-aliases-"));
  mkdirSync(join(fixture, "legal"));
  mkdirSync(join(fixture, "assets"));
  mkdirSync(join(fixture, "fonts"));
  mkdirSync(join(fixture, "brand"));
  writeFileSync(join(fixture, "brand", "logo.png"), "public logo");
  writeFileSync(join(fixture, "brand", "notes.txt"), "public text");
  writeFileSync(join(fixture, "assets", "app.js"), "browser bundle");
  writeFileSync(join(fixture, "fonts", "brand.woff2"), "font bytes");
  writeFileSync(join(fixture, "fonts.css"), "font styles");
  writeFileSync(join(fixture, "botbound-icon.svg"), "<svg/>");
  writeFileSync(join(fixture, "favicon.ico"), "icon bytes");
  writeFileSync(join(fixture, "site.webmanifest"), "{}");
  writeFileSync(join(fixture, "humans.txt"), "people");
  writeFileSync(
    join(fixture, "legal", "data-deletion.html"),
    "<!doctype html><title>Deletion confirmation</title>",
  );
  const app = express();
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    setPublicIsolationHeaders(res);
    next();
  });
  app.get("/api/test", (_req, res) => res.json({ authenticated: true }));
  registerLegacyContentRedirects(app);
  registerProductionStaticAliases(app, fixture);
  app.use(
    express.static(fixture, { redirect: false, setHeaders: productionStaticHeaders(fixture) }),
  );
  app.use(rejectMissingPublicResource);
  app.get("*", (_req, res) => res.type("html").send("SPA fallback"));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListening) => server.once("listening", resolveListening));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  const target = resolve(fixture);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("botbound-static-aliases-")
  ) {
    throw new Error("Refusing cleanup outside this test's generated directory.");
  }
  rmSync(target, { recursive: true, force: true });
});

describe("production public route compatibility", () => {
  it.each(["GET", "HEAD", "POST"])(
    "permanently redirects %s /status and preserves its query",
    async (method) => {
      const response = await fetch(`${origin}/status?from=email&value=%2Ftrust`, {
        method,
        redirect: "manual",
      });
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe("/trust?from=email&value=%2Ftrust");
    },
  );

  it.each(["/legal", "/legal/"])("redirects %s to the terms page", async (path) => {
    const response = await fetch(`${origin}${path}?from=footer`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/terms?from=footer");
  });

  it.each(["/docs", "/docs/"])("redirects %s to the developers page", async (path) => {
    const response = await fetch(`${origin}${path}?topic=api`, { redirect: "manual" });
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/developers?topic=api");
  });

  it("serves the deletion confirmation document at the URL returned to Meta", async () => {
    const response = await fetch(`${origin}/legal/data-deletion?fbid=test-user&code=confirmation`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.redirected).toBe(false);
    expect(await response.text()).toBe("<!doctype html><title>Deletion confirmation</title>");
    expect((await fetch(`${origin}/legal/data-deletion`, { method: "HEAD" })).status).toBe(200);
    expect(await (await fetch(`${origin}/studio`)).text()).toBe("SPA fallback");
  });

  it("keeps these aliases in agreement with the rollback host configuration", () => {
    const aliases = readFileSync(resolve("src/server/register-production-static-aliases.ts"), "utf8");
    expect(aliases).toContain('app.all("/status"');
    expect(aliases).toContain("res.redirect(308, `/trust");
    expect(aliases).toContain('app.get("/legal/data-deletion"');
    expect(aliases).toContain('data-deletion.html');
    const source = readFileSync(resolve("server.ts"), "utf8");
    expect(source.indexOf("registerProductionStaticAliases(app, dist)")).toBeLessThan(
      source.indexOf("app.use(express.static(dist"),
    );
  });

  it.each([
    "/assets/stale-chunk.js",
    "/assets/missing",
    "/fonts/missing.woff2",
    "/missing.css",
    "/missing.js.map",
    "/server.cjs",
    "/legal/missing",
    "/recap/missing/nested",
  ])("returns a non-cacheable 404 instead of SPA HTML for %s", async (path) => {
    // Live behavior is the check: a SPA-rewritten path would return SPA HTML,
    // not the 404 below.
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("Not found.");
  });

  it("keeps existing assets and dotted SPA route segments reachable", async () => {
    const asset = await fetch(`${origin}/assets/app.js`);
    expect(asset.status).toBe(200);
    expect(await asset.text()).toBe("browser bundle");
    for (const path of ["/studio?file=example.js", "/team/jane.doe/settings"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("SPA fallback");
    }
    const head = await fetch(`${origin}/assets/missing.js`, { method: "HEAD" });
    expect(head.status).toBe(404);
    expect(await head.text()).toBe("");
  });

  it.each([
    ["/assets/app.js", "public, max-age=31536000, immutable"],
    ["/fonts/brand.woff2", "public, max-age=31536000, immutable"],
    ["/fonts.css", "public, max-age=86400"],
    ["/botbound-icon.svg", "public, max-age=86400"],
    ["/favicon.ico", "public, max-age=86400"],
    ["/site.webmanifest", "public, max-age=86400"],
    ["/humans.txt", "no-store"],
    ["/studio", "no-store"],
    ["/api/test", "no-store"],
    ["/legal/data-deletion", "no-store"],
    ["/assets/missing.js", "no-store"],
  ])("preserves the intended cache policy for %s", async (path, expected) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.headers.get("cache-control")).toBe(expected);
  });

  it("preserves edge browser isolation headers on pages, assets and API responses", async () => {
    const aliases = readFileSync(resolve("src/server/register-production-static-aliases.ts"), "utf8");
    const expectedHeaders: Array<[string, string]> = [
      ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
      ["Cross-Origin-Resource-Policy", "same-origin"],
      ["Origin-Agent-Cluster", "?1"],
    ];
    for (const [key, value] of expectedHeaders) {
      expect(aliases).toContain(`"${key}", "${value}"`);
    }
    for (const path of ["/studio", "/assets/app.js", "/api/test"]) {
      const response = await fetch(`${origin}${path}`);
      for (const [key, expected] of expectedHeaders) {
        expect(response.headers.get(key)).toBe(expected);
      }
    }
  });

  it("allows email clients to embed resolved public brand images only", async () => {
    const logo = await fetch(`${origin}/brand/logo.png`);
    expect(logo.status).toBe(200);
    expect(logo.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    for (const path of ["/brand/notes.txt", "/brand/missing.png", "/api/test", "/studio"]) {
      const response = await fetch(`${origin}${path}`);
      expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    }
  });
});
