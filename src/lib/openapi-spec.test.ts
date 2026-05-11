// src/lib/openapi-spec.test.ts
//
// @vitest-environment node
//
// Two-axis test for src/lib/openapi-spec.ts:
//
//   1. Structural validity — the spec is a well-formed OpenAPI 3.1
//      document with the security schemes, components, and tags it
//      claims.
//
//   2. Path coverage — every documented method × path actually exists
//      in real code (server.ts or one of the router modules in
//      src/routes/*). If a route is renamed or removed without updating
//      the spec, this test fails with the exact mismatch.
//
// The coverage check is intentionally regex-based (same approach as
// tenancy-isolation.test.ts) so we don't pull in a TypeScript parser
// as a dev-dependency just for this lint.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getOpenApiSpec, listSpecOperations } from "./openapi-spec";
import { WEBHOOK_EVENTS } from "./webhook-helpers";

// ──────────────────────────────────────────────────────────────────────
//  Helpers — find files relative to this test
// ──────────────────────────────────────────────────────────────────────

function repoRoot(): string {
  const here = fileURLToPath(import.meta.url);
  return resolve(here, "../../..");
}

function readIfExists(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function listRouterFiles(): string[] {
  const dir = join(repoRoot(), "src", "routes");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

// ──────────────────────────────────────────────────────────────────────
//  Route discovery — every "<verb>("/path/..." string in server.ts +
//  every router file. Matches both `app.<verb>("/api/...")` and
//  `router.<verb>("/api/..." or "/...")` styles.
// ──────────────────────────────────────────────────────────────────────

type DiscoveredRoute = { method: string; path: string };

function discoverFromSource(src: string, source: string): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  // app.<verb>("...") OR router.<verb>("...")
  const re = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ method: m[1].toLowerCase(), path: m[2] });
  }
  return out.map((r) => ({ ...r, _source: source } as DiscoveredRoute & { _source: string }));
}

/**
 * Returns the full set of routes discovered across server.ts and every
 * router file in src/routes/*. Router files may declare routes with
 * absolute paths (e.g. "/api/agents") or relative paths (e.g. "/",
 * "/:id") if mounted at a prefix in server.ts. Both shapes are recorded
 * — the coverage test below checks for either an exact match or a
 * router-prefixed match.
 */
function discoverAllRoutes(): {
  absolute: Set<string>;
  relative: Array<{ method: string; relPath: string; file: string }>;
} {
  const absolute = new Set<string>();
  const relative: Array<{ method: string; relPath: string; file: string }> = [];

  const serverPath = join(repoRoot(), "server.ts");
  const serverSrc = readIfExists(serverPath);
  for (const r of discoverFromSource(serverSrc, "server.ts")) {
    if (r.path.startsWith("/api/")) absolute.add(`${r.method} ${r.path}`);
  }

  for (const file of listRouterFiles()) {
    const src = readIfExists(file);
    for (const r of discoverFromSource(src, file)) {
      if (r.path.startsWith("/api/")) {
        absolute.add(`${r.method} ${r.path}`);
      } else {
        // Router-relative path — combine with every possible mount
        // prefix found in server.ts. The mounts are matched via the
        // /api prefix only; the static-analysis logic below handles
        // the join.
        relative.push({ method: r.method, relPath: r.path, file });
      }
    }
  }

  return { absolute, relative };
}

/**
 * For router-relative routes, look up every `app.use("/api/<prefix>", <name>Router)`
 * statement in server.ts and synthesize the full path. We don't strictly
 * resolve which router is mounted at which prefix (that would require a
 * real import resolver) — instead we test the **union** of plausible
 * mount prefixes, which is permissive but cannot produce a false-negative
 * for the coverage assertion below (a real route will always synthesize
 * to at least one valid absolute path).
 */
function expandRelativeRoutes(
  relative: Array<{ method: string; relPath: string; file: string }>,
  serverSrc: string,
): Set<string> {
  const out = new Set<string>();
  const mountRe = /app\.use\(\s*["'](\/api(?:\/[^"']*)?)["']/g;
  const mounts: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = mountRe.exec(serverSrc))) mounts.push(m[1]);
  // De-dupe and always include bare /api as a fallback (matches
  // `app.use("/api", complianceRouter)`).
  const uniq = Array.from(new Set([...mounts, "/api"]));
  for (const r of relative) {
    for (const mount of uniq) {
      const full = (mount.replace(/\/$/, "") + (r.relPath === "/" ? "" : r.relPath)) || "/";
      if (full.startsWith("/api")) out.add(`${r.method} ${full}`);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
//  Tests
// ──────────────────────────────────────────────────────────────────────

describe("OpenAPI spec — structural validity", () => {
  const spec = getOpenApiSpec("https://example.test");

  it("declares OpenAPI 3.1.0", () => {
    expect(spec.openapi).toBe("3.1.0");
  });

  it("has a non-empty title, version, and description", () => {
    expect(spec.info.title).toMatch(/Wireline/i);
    expect(spec.info.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(spec.info.description.length).toBeGreaterThan(20);
  });

  it("includes both security schemes (bearer JWT + intake API key)", () => {
    const schemes = spec.components.securitySchemes;
    expect(schemes.bearerAuth).toBeDefined();
    expect(schemes.intakeKeyAuth).toBeDefined();
    expect((schemes.bearerAuth as any).type).toBe("http");
    expect((schemes.intakeKeyAuth as any).type).toBe("apiKey");
    expect((schemes.intakeKeyAuth as any).name).toBe("X-Wireline-Key");
  });

  it("exposes the documented partner-facing surface (intake + agents + calls + webhooks)", () => {
    expect(spec.paths["/api/intake/lead"]?.post).toBeDefined();
    expect(spec.paths["/api/agents"]?.get).toBeDefined();
    expect(spec.paths["/api/calls"]?.get).toBeDefined();
    expect(spec.paths["/api/webhooks"]?.get).toBeDefined();
    expect(spec.paths["/api/webhooks"]?.post).toBeDefined();
    expect(spec.paths["/api/openapi.json"]?.get).toBeDefined();
  });

  it("declares webhook callback shapes for every event in WEBHOOK_EVENTS", () => {
    const declared = Object.keys(spec.webhooks || {});
    for (const ev of WEBHOOK_EVENTS) {
      expect(declared, `missing webhook entry for "${ev}"`).toContain(ev);
    }
  });

  it("every operation has an operationId (required for SDK generation)", () => {
    const seen = new Set<string>();
    for (const item of Object.values(spec.paths)) {
      for (const op of Object.values(item as Record<string, { operationId?: string }>)) {
        if (!op) continue;
        const id = op.operationId;
        expect(id, "operationId missing on a path").toBeDefined();
        expect(id!.length).toBeGreaterThan(0);
        expect(seen.has(id!), `duplicate operationId "${id}"`).toBe(false);
        seen.add(id!);
      }
    }
  });

  it("intake endpoints declare the intakeKey security scheme (not bearer)", () => {
    const post = spec.paths["/api/intake/lead"]?.post;
    expect(post).toBeDefined();
    const sec = post!.security || [];
    expect(sec.some((s) => Object.keys(s).includes("intakeKeyAuth"))).toBe(true);
    expect(sec.some((s) => Object.keys(s).includes("bearerAuth"))).toBe(false);
  });

  it("public endpoints declare empty security (no auth required)", () => {
    const publicOps = [
      spec.paths["/api/health"]?.get,
      spec.paths["/api/openapi.json"]?.get,
      spec.paths["/api/billing/plans"]?.get,
      spec.paths["/api/agents/roles"]?.get,
    ];
    for (const op of publicOps) {
      expect(op).toBeDefined();
      expect(op!.security).toEqual([]);
    }
  });
});

describe("OpenAPI spec — path coverage against real route discovery", () => {
  const { absolute, relative } = discoverAllRoutes();
  const serverSrc = readIfExists(join(repoRoot(), "server.ts"));
  const expanded = expandRelativeRoutes(relative, serverSrc);
  const allDiscovered = new Set<string>([...absolute, ...expanded]);

  it("sanity-checks the route discovery (finds a non-trivial number of routes)", () => {
    // If the regex broke, this drops to zero and we know to fix it
    // before trusting the coverage assertion below.
    expect(allDiscovered.size).toBeGreaterThan(40);
  });

  it("every documented method × path exists in real source", () => {
    const missing: string[] = [];
    for (const op of listSpecOperations()) {
      const key = `${op.method} ${op.path}`;
      if (!allDiscovered.has(key)) missing.push(key);
    }
    if (missing.length > 0) {
      throw new Error(
        "OpenAPI spec references routes that don't exist in real code — either " +
          "the path was renamed in server.ts/src/routes/* or the spec is stale. " +
          "Fix the spec in src/lib/openapi-spec.ts.\n\n" +
          missing.map((m) => `  • ${m}`).join("\n"),
      );
    }
  });
});
