import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/*
 * Operator runbooks are read under pressure, and a runbook that names an
 * endpoint which does not exist wastes the one resource an incident has least
 * of. Two were doing exactly that:
 *
 *   - The go/no-go command centre told the operator to re-check a demo line via
 *     `GET /api/health/canary` before demo traffic. That route has never been
 *     mounted; production returns nothing for it. The same string was also
 *     wired into a production alert email.
 *   - The load-test runbook targeted `/api/vapi/webhook` — including in its
 *     copy-pasteable k6 script — while the mounted path is `/api/vapi-webhook`.
 *     A load test against a 404 measures the 404 handler and passes happily,
 *     which is worse than not running one.
 *
 * This reads the health endpoints the server actually mounts and holds the
 * runbooks to them.
 */

/** Health paths mounted under the `/api/health` router, derived from source. */
function mountedHealthPaths(): Set<string> {
  const router = read("src/routes/health-routes.ts");
  const paths = new Set<string>();
  for (const match of router.matchAll(/router\.(?:get|post|all)\(\s*"([^"]+)"/g)) {
    const sub = match[1] === "/" ? "" : match[1];
    paths.add(`/api/health${sub}`);
  }
  // Registered directly on the app rather than the router.
  const registry = read("src/server/register-api-routes.ts");
  for (const match of registry.matchAll(/app\.(?:use|all|get)\(\s*"(\/api\/health[^"]*)"/g)) {
    paths.add(match[1]);
  }
  // Mounted by a sibling router with a full path.
  const observability = read("src/routes/voice-observability-routes.ts");
  for (const match of observability.matchAll(/"(\/api\/health\/[^"]+)"/g)) {
    paths.add(match[1]);
  }
  return paths;
}

describe("runbooks only name endpoints that exist", () => {
  const mounted = mountedHealthPaths();

  it("derives a non-trivial set of real health endpoints", () => {
    // Guard the guard: a parser that silently matched nothing would make every
    // assertion below vacuous.
    expect(mounted.size).toBeGreaterThanOrEqual(4);
    expect(mounted).toContain("/api/health/public");
    expect(mounted).toContain("/api/health/voice-status");
  });

  /*
   * Scanning docs/ alone was not enough, and the gap was the whole point: the
   * first fix corrected the runbook prose while `src/lib/demo-line-canary.ts`
   * kept SENDING operators the same phantom endpoint in a production alert
   * email. Documentation is not the only thing that instructs a human. Source
   * files that emit operator-facing text are scanned too.
   */
  it("cites no health endpoint the server does not mount", () => {
    const docsDir = resolve(process.cwd(), "docs");
    const offenders: string[] = [];

    // Source files whose strings reach an operator (alerts, emails, runbook
    // text embedded in code).
    for (const file of ["src/lib/demo-line-canary.ts"]) {
      for (const [index, line] of read(file).split("\n").entries()) {
        if (/never existed|does not exist|not mounted/i.test(line)) continue;
        for (const match of line.matchAll(/\/api\/health\/[a-z0-9-]+/g)) {
          if (!mounted.has(match[0])) offenders.push(`${file}:${index + 1} → ${match[0]}`);
        }
      }
    }

    for (const file of readdirSync(docsDir).filter((name) => name.endsWith(".md"))) {
      const source = read(`docs/${file}`);
      for (const [index, line] of source.split("\n").entries()) {
        // A line that explicitly says the path is absent is documentation of
        // the very defect this guards, not a live instruction.
        if (/never existed|does not exist|not mounted/i.test(line)) continue;
        for (const match of line.matchAll(/\/api\/health\/[a-z0-9-]+/g)) {
          if (!mounted.has(match[0])) offenders.push(`${file}:${index + 1} → ${match[0]}`);
        }
      }
    }

    expect(
      offenders,
      `Runbooks name health endpoints that are not mounted:\n${offenders.join("\n")}\n` +
        `Mounted: ${[...mounted].sort().join(", ")}`,
    ).toEqual([]);
  });

  it("points the load test at the mounted Vapi webhook path", () => {
    const loadTest = read("docs/LOAD_TEST.md");
    const registry = read("src/server/register-api-routes.ts");

    expect(registry).toContain('app.use("/api/vapi-webhook"');
    expect(loadTest).toContain("/api/vapi-webhook");
    // The old path would have load-tested the 404 handler and reported success.
    expect(loadTest).not.toContain("/api/vapi/webhook");
  });
});
