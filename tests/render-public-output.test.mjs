import express from "express";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isolateApiPublicOutput } from "../deploy/render/public-output.mjs";

let root;
let server;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "botbound-render-public-"));
  const dist = join(root, "dist");
  mkdirSync(join(dist, "assets"), { recursive: true });
  mkdirSync(join(dist, "pricing"));
  writeFileSync(join(dist, "index.html"), "public shell");
  writeFileSync(join(dist, "pricing", "index.html"), "pricing shell");
  writeFileSync(join(dist, "assets", "app.js"), "public browser script");
  writeFileSync(join(dist, "server.cjs"), "private server implementation");
  writeFileSync(join(dist, "server.cjs.map"), "private server source map");
  writeFileSync(join(dist, "render-release.json"), '{"revision":"private release proof"}');
});

afterEach(async () => {
  if (server) {
    await new Promise((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
    server = undefined;
  }
  const target = resolve(root);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("botbound-render-public-")
  ) {
    throw new Error("Refusing cleanup outside this test's generated temporary directory.");
  }
  rmSync(target, { recursive: true, force: true });
});

describe("Render static artifact isolation", () => {
  it("serves the browser output while keeping server bundles and release metadata unreachable", async () => {
    const client = isolateApiPublicOutput(root);
    const app = express();
    app.use(express.static(client, { redirect: false }));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolveListening) => server.once("listening", resolveListening));
    const origin = `http://127.0.0.1:${server.address().port}`;

    expect(await (await fetch(`${origin}/`)).text()).toBe("public shell");
    expect(await (await fetch(`${origin}/assets/app.js`)).text()).toBe("public browser script");
    expect(await (await fetch(`${origin}/pricing/index.html`)).text()).toBe("pricing shell");
    for (const name of ["server.cjs", "server.cjs.map", "render-release.json"]) {
      expect((await fetch(`${origin}/${name}`)).status).toBe(404);
      expect(readFileSync(join(root, "dist", name), "utf8")).toContain("private");
    }
  });

  it("refuses to overwrite an existing public partition", () => {
    mkdirSync(join(root, "dist", "client"));
    expect(() => isolateApiPublicOutput(root)).toThrow("already partitioned");
    expect(readFileSync(join(root, "dist", "index.html"), "utf8")).toBe("public shell");
  });
});
