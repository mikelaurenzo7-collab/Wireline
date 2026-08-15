import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Body of the block starting at the `{` at or after `from`, by brace matching. */
function blockAt(source: string, from: number): string {
  const start = source.indexOf("{", from);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return source.slice(start);
}

const POOLED_CALL = /\bdrizzle\s*\.\s*(select|insert|update|delete|execute|query|transaction)\b/;

/**
 * The connection pool is small and `drizzle` is the POOLED handle.
 *
 * Using it inside an open `drizzle.transaction` callback checks out a second
 * connection while the first is still pinned. Under concurrency, pool-size
 * requests each hold one connection and block waiting for one that only
 * another of them can release — a self-inflicted deadlock that resolves by
 * acquisition timeout, usually with an advisory lock held the whole way. It is
 * also a correctness trap: work done on the pooled handle is NOT part of the
 * transaction, so a rollback leaves it behind.
 *
 * Inside a transaction, always use the `tx` handle. Helpers that may be called
 * from either context should take the handle as a parameter — see
 * `assertAgentCapacity` in agent-draft-service.ts and `loadIdentityState` in
 * company-identity-routes.ts for the shape.
 */
describe("no pooled database handle is used inside an open transaction", () => {
  const files = walk(SRC);

  it("has no direct pooled call inside a transaction callback", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("drizzle.transaction")) continue;
      const pattern = /drizzle\.transaction\(\s*async\s*\(?[^)]*\)?\s*=>/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const body = blockAt(source, match.index + match[0].length);
        if (POOLED_CALL.test(body)) {
          offenders.push(
            `${relative(ROOT, file)}:${source.slice(0, match.index).split("\n").length}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Helpers that touch the pool and are awaited from inside a transaction.
   *
   * Known exception, deliberately listed rather than silently allowed:
   * `seedFounderAssistant` is awaited inside founder-bootstrap's transaction
   * and writes through the pool. It is owner-only (`isOwnerEmail` gates it),
   * guarded per process by `bootstrapInFlight`, and its writes are idempotent
   * upserts on deterministic agent ids, so the practical blast radius is a
   * failed bootstrap that retries on the next sign-in. Threading `tx` through
   * the whole seed is the real fix; until then this entry keeps the exception
   * visible instead of letting the class quietly regrow around it.
   */
  const KNOWN_EXCEPTIONS = new Set(["seedFounderAssistant"]);

  it("has no NEW helper that reaches the pool from inside a transaction", () => {
    const pooledHelpers = new Map<string, string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const pattern = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const body = blockAt(source, match.index + match[0].length);
        // A helper that takes its own db/tx handle is parameterised correctly;
        // its default only applies when it is called outside a transaction.
        const signature = source.slice(match.index, source.indexOf("{", match.index));
        if (/\b(db|tx)\s*:/.test(signature)) continue;
        if (POOLED_CALL.test(body)) pooledHelpers.set(match[1], relative(ROOT, file));
      }
    }

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes(".transaction(")) continue;
      const pattern = /\.transaction\(\s*async\s*\(?[^)]*\)?\s*=>/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        const body = blockAt(source, match.index + match[0].length);
        for (const call of new Set(body.match(/await\s+([A-Za-z0-9_]+)\s*\(/g) || [])) {
          const name = call.replace(/await\s+/, "").replace(/\s*\($/, "");
          if (!pooledHelpers.has(name) || KNOWN_EXCEPTIONS.has(name)) continue;
          offenders.push(
            `${relative(ROOT, file)} awaits ${name}() which uses the pool (${pooledHelpers.get(name)})`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the two parameterised helpers taking their handle", () => {
    // These are the reference shape the rule points at; if they lose the
    // parameter the guidance in this file stops being followable.
    expect(readFileSync(join(SRC, "lib/agent-draft-service.ts"), "utf8")).toContain(
      "db: Pick<typeof drizzle",
    );
    expect(readFileSync(join(SRC, "routes/company-identity-routes.ts"), "utf8")).toContain(
      "db: IdentityReader = drizzle",
    );
  });
});
