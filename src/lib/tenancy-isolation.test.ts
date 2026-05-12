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

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// Locate the repo root relative to this test file.
function locateRepoRoot(): string {
  const candidates: string[] = [];
  try {
    const here = fileURLToPath(import.meta.url);
    candidates.push(resolve(here, '../../..'));
  } catch {
    /* not ESM */
  }
  if (typeof __dirname !== 'undefined') {
    candidates.push(resolve(__dirname, '../..'));
  }
  candidates.push(process.cwd());
  for (const c of candidates) {
    if (existsSync(join(c, 'server.ts'))) return c;
  }
  throw new Error(`Could not locate repo root; tried: ${candidates.join(', ')}`);
}

const REPO_ROOT = locateRepoRoot();
const SERVER_TS = readFileSync(join(REPO_ROOT, 'server.ts'), 'utf8');

function listRouterFiles(): string[] {
  const dir = join(REPO_ROOT, 'src', 'routes');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.tsx'))
    .map((f) => join(dir, f));
}

// ──────────────────────────────────────────────────────────────────────
//  Route discovery
// ──────────────────────────────────────────────────────────────────────
//
// We look for `app.<verb>(...)` calls in server.ts AND
// `router.<verb>(...)` calls in every src/routes/*.ts file. Router files
// commonly use relative paths (e.g. "/", "/:id") that are mounted at a
// prefix in server.ts via `app.use("/api/<prefix>", <name>Router)`.
// We resolve those prefixes by mapping each router file's default-export
// name back to its mount prefix in server.ts.
//
// For each route we capture:
//   - the HTTP method and full absolute path
//   - whether `authenticateUser` is present in the middleware list
//   - the body of the route handler (from the match to the next match
//     or end of file) — extracted by a fuzzy scan so nested {} don't
//     trip us up.
//
// We do NOT use a real TS parser here: introducing one as a dev-dep just
// for this lint would be heavyweight, and a regex+brace scan is
// sufficient because server.ts and the router files use a consistent style.

interface Route {
  method: string;
  path: string;
  startLine: number;
  endLine: number;
  body: string;
  hasAuth: boolean;
  source: string; // e.g. "server.ts" or "src/routes/webhook-routes.ts"
}

/**
 * Build a Map<routerFileBasename, mountPrefix> from server.ts.
 *
 * We do this by:
 *   1. Finding every `import <name> from "./src/routes/<file>"` line
 *      → maps the variable name to the router file basename.
 *   2. Finding every `app.use("/api/<prefix>", <name>);` or
 *      `app.use(<name>);` line → maps the variable name to a mount.
 *   3. Joining the two so we know the mount prefix per router file.
 *
 * Router files whose default export is mounted without a prefix get
 * an empty-string mount. Their declared paths are then treated as
 * absolute (which is how server.ts's bare `app.use(<router>)` mounts
 * have always behaved historically — the router's own paths must
 * already start with `/api/...`).
 */
function buildRouterMountMap(serverSrc: string): Map<string, string> {
  // name → file basename without extension
  const nameToFile = new Map<string, string>();
  const importRe = /import\s+(\w+)\s+from\s+["']\.\/src\/routes\/([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(serverSrc))) {
    nameToFile.set(m[1], m[2].replace(/\.[tj]sx?$/, ''));
  }

  // name → mount prefix ("" if bare)
  const nameToMount = new Map<string, string>();
  // `app.use("/api/...", <name>)`
  const usePrefixedRe = /app\.use\(\s*["'](\/api(?:\/[^"']*)?)["']\s*,\s*(\w+)\s*\)/g;
  while ((m = usePrefixedRe.exec(serverSrc))) {
    nameToMount.set(m[2], m[1]);
  }
  // `app.use(<name>)` — bare mount
  const useBareRe = /app\.use\(\s*(\w+)\s*\)/g;
  while ((m = useBareRe.exec(serverSrc))) {
    if (!nameToMount.has(m[1]) && nameToFile.has(m[1])) {
      nameToMount.set(m[1], '');
    }
  }

  // file basename → mount
  const fileToMount = new Map<string, string>();
  for (const [name, file] of nameToFile) {
    if (nameToMount.has(name)) {
      fileToMount.set(file, nameToMount.get(name)!);
    }
  }
  return fileToMount;
}

/**
 * Scan a single source for `(app|router).<verb>("path", ...)` calls and
 * return one Route per match. For router-relative paths (i.e. paths
 * that don't start with "/api/"), prepend `mountPrefix`.
 */
function discoverRoutesInSource(src: string, source: string, mountPrefix: string): Route[] {
  const routes: Route[] = [];
  // Matches both:
  //   (app|router).<verb>("path", ...)
  //   (app|router).<verb>(['path', 'path2'], ...)   ← we capture only the first path
  // The array form is the boundary that closes the previous route's body
  // (otherwise the previous route swallows everything up to the next
  // single-string declaration, which yields false-positive tenancy
  // violations against unrelated code below it).
  const re = /\b(?:app|router)\.(get|post|put|patch|delete)\(\s*(?:\[\s*)?["']([^"']+)["']/g;

  // Pre-compute line offsets for error reporting.
  const lineStarts: number[] = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') lineStarts.push(i + 1);
  }
  const lineFor = (offset: number): number => {
    let lo = 0,
      hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  // First pass: collect every match.
  const starts: Array<{ method: string; rawPath: string; idx: number; matchEnd: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    starts.push({ method: m[1], rawPath: m[2], idx: m.index, matchEnd: re.lastIndex });
  }

  // Second pass: build full absolute paths + per-route bodies.
  for (let i = 0; i < starts.length; i++) {
    const cur = starts[i];
    const next = starts[i + 1];
    const bodyEnd = next ? next.idx : src.length;
    const body = src.slice(cur.matchEnd, bodyEnd);

    let fullPath: string;
    if (cur.rawPath.startsWith('/api/') || cur.rawPath === '/api') {
      // Absolute — ignore mount prefix entirely.
      fullPath = cur.rawPath;
    } else if (cur.rawPath.startsWith('/')) {
      // Router-relative — prepend the mount prefix.
      const prefix = mountPrefix.replace(/\/$/, '');
      fullPath = cur.rawPath === '/' ? prefix : prefix + cur.rawPath;
    } else {
      // Non-API route (e.g. UI fallback). Skip.
      continue;
    }
    if (!fullPath.startsWith('/api/') && fullPath !== '/api') continue;

    const mwSlice = body.slice(0, Math.min(1024, body.length));
    const hasAuth = /\bauthenticateUser\b/.test(mwSlice);

    routes.push({
      method: cur.method,
      path: fullPath,
      startLine: lineFor(cur.idx),
      endLine: lineFor(bodyEnd),
      body,
      hasAuth,
      source,
    });
  }
  return routes;
}

function discoverRoutes(_legacyServerSrc: string): Route[] {
  const all: Route[] = [];

  // server.ts: `app.<verb>(...)` calls — always absolute.
  all.push(...discoverRoutesInSource(SERVER_TS, 'server.ts', ''));

  // src/routes/*.ts: `router.<verb>(...)` calls — may be absolute or
  // router-relative depending on the file.
  const fileToMount = buildRouterMountMap(SERVER_TS);
  for (const file of listRouterFiles()) {
    const src = readFileSync(file, 'utf8');
    const fileKey = basename(file).replace(/\.[tj]sx?$/, '');
    const mount = fileToMount.get(fileKey) ?? '';
    const rel = `src/routes/${basename(file)}`;
    all.push(...discoverRoutesInSource(src, rel, mount));
  }

  return all;
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
  'POST /api/intake/lead',
  'POST /api/intake/leads',
  // Public plan catalog — no tenant data.
  'GET /api/billing/plans',
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

describe('Tenancy isolation for service-role routes', () => {
  const routes = discoverRoutes(SERVER_TS);

  it('discovers a non-trivial number of authenticated routes', () => {
    // Sanity-check the parser — if this drops to zero the regex broke.
    const authed = routes.filter((r) => r.hasAuth);
    expect(authed.length).toBeGreaterThan(40);
  });

  it('every authenticated route that touches a wireline_* table references user_id scoping', () => {
    const offenders: Array<{ route: string; line: number; reason: string; source: string }> = [];

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
        bodyMentions(route.body, '"user_id"', "'user_id'", 'user_id:') ||
        /\buser_id\b/.test(route.body);
      const mentionsCallerUser =
        bodyMentions(route.body, 'req.user.id', 'req.user?.id', 'req.user!.id') ||
        /\b(uid|userId)\s*=\s*req\.user/.test(route.body);

      if (!(mentionsUserId && mentionsCallerUser)) {
        offenders.push({
          route: id,
          line: route.startLine,
          source: route.source,
          reason: !mentionsUserId
            ? "touches a wireline_* table but never references the column 'user_id'"
            : 'touches a wireline_* table but never references req.user.id',
        });
      }
    }

    if (offenders.length > 0) {
      const lines = offenders.map(
        (o) => `  • ${o.source}:${o.line}  ${o.route}\n      ${o.reason}`,
      );
      throw new Error(
        'Tenancy isolation violation — these routes access a wireline_* ' +
          'table under the service-role client without scoping to req.user.id.\n' +
          'Either add the `.eq("user_id", req.user.id)` filter (and `user_id:` ' +
          'field on inserts), or add the path to TENANCY_ALLOWLIST in ' +
          'src/lib/tenancy-isolation.test.ts with a comment explaining why.\n\n' +
          lines.join('\n'),
      );
    }
  });

  it('allowlist entries actually correspond to real routes (no stale ignores)', () => {
    const known = new Set(routes.map((r) => `${r.method.toUpperCase()} ${r.path}`));
    const stale: string[] = [];
    for (const id of TENANCY_ALLOWLIST) {
      if (!known.has(id)) stale.push(id);
    }
    if (stale.length > 0) {
      throw new Error(
        'TENANCY_ALLOWLIST contains entries that no longer match any route — ' +
          'remove them or fix the route signature.\n' +
          stale.map((s) => `  • ${s}`).join('\n'),
      );
    }
  });

  it('authenticated tenant-scoped GETs use .eq("user_id", ...) (not just an insert column)', () => {
    // For READ routes the only acceptable scope is an explicit .eq()
    // filter — an insert-style `user_id: ...` won't help a SELECT.
    const offenders: Array<{ route: string; line: number; source: string }> = [];

    for (const route of routes) {
      if (route.method !== 'get') continue;
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
        offenders.push({ route: id, line: route.startLine, source: route.source });
      }
    }

    if (offenders.length > 0) {
      const lines = offenders.map((o) => `  • ${o.source}:${o.line}  ${o.route}`);
      throw new Error(
        'GET routes against wireline_* must filter rows by user_id with ' +
          '.eq(), .in(), or .match() — service-role queries bypass RLS.\n' +
          lines.join('\n'),
      );
    }
  });
});
