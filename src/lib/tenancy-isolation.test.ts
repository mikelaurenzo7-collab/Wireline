// src/lib/tenancy-isolation.test.ts
//
// @vitest-environment node
//
// Tenancy integration tests for service-role-backed routes (item 7).
//
// Background
// ──────────
// `server.ts` uses a single service-role Supabase client (the `db`
// variable) that bypasses Row-Level Security. Every authenticated
// handler that reads or writes a `wireline_*` table MUST therefore
// either:
//
//   (a) filter by `user_id` (the column every tenant-scoped table
//       carries — see RLS policies in supabase_schema.sql), or
//   (b) appear in the allowlist below because the route legitimately
//       crosses tenant boundaries (third-party webhooks like Stripe /
//       Vapi, the intake lead endpoint authenticated via API key,
//       OAuth callbacks, etc).
//
// A handler that calls `db.from("wireline_<x>")` without scoping by
// user_id leaks (read) or corrupts (write) other tenants' data. The
// CC1.1 SOC 2 control requires this isolation to be auditable, so we
// enforce it with a static analyzer that runs on every CI build.
//
// This test reads server.ts as text, splits it into per-handler blocks,
// and for each block asserts the invariant. New routes added without
// scoping fail the build with a precise location.
//
// Runtime tenancy coverage for the audit/* endpoints lives in
// audit-routes.test.ts — that file drives real Express handlers with a
// chainable Supabase stub. This file complements it by guarding the
// rest of server.ts that can't easily be loaded into a test process.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Locate server.ts relative to this test file. We try ESM-style
// `import.meta.url` (vitest runs as ESM), then fall back to CJS
// __dirname for safety.
function locateServerTs(): string {
  const candidates: string[] = [];
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(resolve(here, "../../../server.ts"));
  } catch {
    /* not ESM */
  }
  if (typeof __dirname !== "undefined") {
    candidates.push(join(__dirname, "../../server.ts"));
  }
  // Final fallback: relative to the current working directory.
  candidates.push(resolve(process.cwd(), "server.ts"));
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(
    `Could not locate server.ts; tried: ${candidates.join(", ")}`,
  );
}

const SERVER_TS = readFileSync(locateServerTs(), "utf8");

// ──────────────────────────────────────────────────────────────────────
//  Route discovery
// ──────────────────────────────────────────────────────────────────────
//
// We look for `app.get/post/put/patch/delete("/api/...", ...)` calls.
// For each route we capture:
//   - the HTTP method and path
//   - whether `authenticateUser` is present in the middleware list (we
//     only enforce tenancy on authenticated routes; public/webhook
//     routes are allowlisted separately)
//   - the body of the route handler (the async function passed as the
//     last argument) — extracted by brace-matching so nested {} don't
//     trip us up.
//
// We do NOT use a real TS parser here: introducing one as a dev-dep just
// for this lint would be heavyweight, and a regex+brace scan is
// sufficient because server.ts uses a consistent style.

interface Route {
  method: string;
  path: string;
  startLine: number;
  endLine: number;
  body: string;
  hasAuth: boolean;
}

function discoverRoutes(src: string): Route[] {
  const routes: Route[] = [];
  // Match `app.<verb>("<path>",`. We capture the verb + path and the
  // start offset of the match. The "body" of each route is then taken
  // to be everything from this match up to the NEXT match (or EOF).
  // This is intentionally fuzzy — a precise brace/paren scanner trips
  // on regex literals and nested template expressions — but it's
  // sufficient for the user_id static check because the substring
  // strictly contains the real handler body (and possibly trailing
  // top-level code, which only ever LOOSENS the check, never
  // tightens it incorrectly).
  const re = /\bapp\.(get|post|put|patch|delete)\(\s*"([^"]+)"\s*,/g;
  // Pre-compute line offsets so we can report failures with line numbers.
  const lineStarts: number[] = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") lineStarts.push(i + 1);
  }
  const lineFor = (offset: number): number => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  // First pass: collect all match starts.
  const starts: Array<{ method: string; path: string; idx: number; matchEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const path = m[2];
    if (!path.startsWith("/api/")) continue;
    starts.push({ method: m[1], path, idx: m.index, matchEnd: re.lastIndex });
  }

  // Second pass: each route's body is the text from its matchEnd up
  // to the NEXT route's matchStart (or end of file for the last one).
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const next = starts[i + 1];
    const bodyEnd = next ? next.idx : src.length;
    const body = src.slice(cur.matchEnd, bodyEnd);
    // Middleware list = the first line or two of body up to the
    // arrow function. We take a generous cut-off (1 KB) which
    // covers the longest middleware chain in the file.
    const mwSlice = body.slice(0, Math.min(1024, body.length));
    const hasAuth = /\bauthenticateUser\b/.test(mwSlice);
    routes.push({
      method: cur.method,
      path: cur.path,
      startLine: lineFor(cur.idx),
      endLine: lineFor(bodyEnd),
      body,
      hasAuth,
    });
  }
  return routes;
}

// ──────────────────────────────────────────────────────────────────────
//  Allowlist
// ──────────────────────────────────────────────────────────────────────
//
// Routes that legitimately do NOT scope by `user_id` because they
// authenticate the caller through a different mechanism (signed
// third-party webhook, API key, public catalog, OAuth callback, ...).
//
// Adding entries here is a deliberate exception — the comment beside
// each path explains why.
const TENANCY_ALLOWLIST = new Set<string>([
  // Inbound lead intake — authenticated by an API key hash lookup
  // (`wireline_intake_keys.key_hash`). The matching row carries the
  // user_id which is then used to stamp every downstream insert.
  "POST /api/intake/lead",
  "POST /api/intake/leads",
  // Public plan catalog — no tenant data.
  "GET /api/billing/plans",
  // NOTE: /api/stripe-webhook, /api/health, /api/jobs/sweep, and
  // /api/vapi-webhook used to live as `app.<verb>(...)` calls in
  // server.ts and were allowlisted here. They have since moved to
  // dedicated router files (src/routes/{stripe,health,job,vapi}-routes.ts)
  // and are therefore invisible to the regex-based route discovery
  // below. Their cross-tenant nature is unchanged; they simply don't
  // need entries in this set anymore.
]);

// Helper: do these strings appear in the body?
function bodyMentions(body: string, ...needles: string[]): boolean {
  return needles.some((n) => body.includes(n));
}

// ──────────────────────────────────────────────────────────────────────
//  The test suite
// ──────────────────────────────────────────────────────────────────────

describe("Tenancy isolation for service-role routes", () => {
  const routes = discoverRoutes(SERVER_TS);

  it("discovers a non-trivial number of authenticated routes", () => {
    // Sanity-check the parser — if this drops to zero the regex broke.
    const authed = routes.filter((r) => r.hasAuth);
    expect(authed.length).toBeGreaterThan(40);
  });

  it("every authenticated route that touches a wireline_* table references user_id scoping", () => {
    const offenders: Array<{ route: string; line: number; reason: string }> = [];

    for (const route of routes) {
      const id = `${route.method.toUpperCase()} ${route.path}`;
      if (TENANCY_ALLOWLIST.has(id)) continue;
      if (!route.hasAuth) continue; // Unauthenticated routes are out of scope here.

      const touchesTable = /db\.from\(\s*["']wireline_/.test(route.body);
      if (!touchesTable) continue;

      // The route must reference `user_id` somehow. We accept a few
      // shapes:
      //   - `.eq("user_id", req.user.id)` — the canonical form
      //   - `user_id: req.user.id` — insert/upsert payload
      //   - `user_id: uid` where `uid = req.user.id` is bound earlier
      //   - `req.user.id` referenced AND the table is accessed only
      //     through helpers that are themselves user-scoped (e.g.
      //     `req.user.id` appears in the body and `user_id` appears)
      const mentionsUserId =
        bodyMentions(route.body, '"user_id"', "'user_id'", "user_id:") ||
        /\buser_id\b/.test(route.body);
      const mentionsCallerUser =
        bodyMentions(route.body, "req.user.id", "req.user?.id", "req.user!.id") ||
        /\b(uid|userId)\s*=\s*req\.user/.test(route.body);

      if (!(mentionsUserId && mentionsCallerUser)) {
        offenders.push({
          route: id,
          line: route.startLine,
          reason: !mentionsUserId
            ? "touches a wireline_* table but never references the column 'user_id'"
            : "touches a wireline_* table but never references req.user.id",
        });
      }
    }

    if (offenders.length > 0) {
      const lines = offenders.map(
        (o) => `  • server.ts:${o.line}  ${o.route}\n      ${o.reason}`,
      );
      throw new Error(
        "Tenancy isolation violation — these routes access a wireline_* " +
          "table under the service-role client without scoping to req.user.id.\n" +
          "Either add the `.eq(\"user_id\", req.user.id)` filter (and `user_id:` " +
          "field on inserts), or add the path to TENANCY_ALLOWLIST in " +
          "src/lib/tenancy-isolation.test.ts with a comment explaining why.\n\n" +
          lines.join("\n"),
      );
    }
  });

  it("allowlist entries actually correspond to real routes (no stale ignores)", () => {
    const known = new Set(
      routes.map((r) => `${r.method.toUpperCase()} ${r.path}`),
    );
    const stale: string[] = [];
    for (const id of TENANCY_ALLOWLIST) {
      if (!known.has(id)) stale.push(id);
    }
    if (stale.length > 0) {
      throw new Error(
        "TENANCY_ALLOWLIST contains entries that no longer match any route — " +
          "remove them or fix the route signature.\n" +
          stale.map((s) => `  • ${s}`).join("\n"),
      );
    }
  });

  it("authenticated tenant-scoped GETs use .eq(\"user_id\", ...) (not just an insert column)", () => {
    // For READ routes the only acceptable scope is an explicit .eq()
    // filter — an insert-style `user_id: ...` won't help a SELECT.
    const offenders: Array<{ route: string; line: number }> = [];

    for (const route of routes) {
      if (route.method !== "get") continue;
      const id = `${route.method.toUpperCase()} ${route.path}`;
      if (TENANCY_ALLOWLIST.has(id)) continue;
      if (!route.hasAuth) continue;
      if (!/db\.from\(\s*["']wireline_/.test(route.body)) continue;

      // Accept .eq("user_id", ...), or a select-shape that filters via
      // `.match({ user_id: ... })`, or `.in("user_id", ...)`.
      const hasReadScope =
        /\.eq\(\s*["']user_id["']/.test(route.body) ||
        /\.match\(\s*\{[^}]*user_id/.test(route.body) ||
        /\.in\(\s*["']user_id["']/.test(route.body);

      if (!hasReadScope) {
        offenders.push({ route: id, line: route.startLine });
      }
    }

    if (offenders.length > 0) {
      const lines = offenders.map((o) => `  • server.ts:${o.line}  ${o.route}`);
      throw new Error(
        "GET routes against wireline_* must filter rows by user_id with " +
          ".eq(), .in(), or .match() — service-role queries bypass RLS.\n" +
          lines.join("\n"),
      );
    }
  });
});
