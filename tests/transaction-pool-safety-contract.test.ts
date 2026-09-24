import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");
const FILESYSTEM_SCAN_TIMEOUT_MS = 90_000;

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

function delegatedExecutorIndex(signature: string, body: string): number | undefined {
  // An optional executor is safe only when the supplied handle returns through
  // the same callback used by the standalone transaction fallback, and that
  // fallback is the helper's sole pooled operation.
  const delegation = body.match(
    /if\s*\((\w+)\)\s*return\s+(\w+)\(\1\);\s*return\s+drizzle\.transaction\(\2\);\s*$/,
  );
  if (!delegation || [...body.matchAll(new RegExp(POOLED_CALL.source, "g"))].length !== 1) {
    return undefined;
  }
  const parsed = ts.createSourceFile(
    "helper.ts",
    `${signature}${body}}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const declaration = parsed.statements.find(ts.isFunctionDeclaration);
  const index = declaration?.parameters.findIndex(
    (parameter) => parameter.name.getText(parsed) === delegation[1],
  );
  return index !== undefined && index >= 0 ? index : undefined;
}

function awaitedHelpers(body: string): Array<{ name: string; arguments: string[] }> {
  const parsed = ts.createSourceFile(
    "callback.ts",
    `async function audit()${body}}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const calls: Array<{ name: string; arguments: string[] }> = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isAwaitExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      calls.push({
        name: node.expression.expression.text,
        arguments: node.expression.arguments.map((argument) => argument.getText(parsed)),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return calls;
}

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

  it(
    "has no direct pooled call inside a transaction callback",
    () => {
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
    },
    FILESYSTEM_SCAN_TIMEOUT_MS,
  );

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

  it(
    "has no NEW helper that reaches the pool from inside a transaction",
    () => {
      const pooledHelpers = new Map<string, { file: string; executorIndex?: number }>();
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
          if (POOLED_CALL.test(body)) {
            pooledHelpers.set(match[1], {
              file: relative(ROOT, file),
              executorIndex: delegatedExecutorIndex(signature, body),
            });
          }
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
          const transactionHandle = match[0].match(/async\s*\(?\s*(\w+)/)?.[1];
          for (const call of awaitedHelpers(body)) {
            const helper = pooledHelpers.get(call.name);
            if (!helper || KNOWN_EXCEPTIONS.has(call.name)) continue;
            if (
              transactionHandle &&
              helper.executorIndex !== undefined &&
              call.arguments[helper.executorIndex] === transactionHandle
            )
              continue;
            offenders.push(
              `${relative(ROOT, file)} awaits ${call.name}() which uses the pool (${helper.file})`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    },
    FILESYSTEM_SCAN_TIMEOUT_MS,
  );

  it("requires an optional executor call to forward this transaction, including mixed calls", () => {
    const signature = "async function revoke(userId: string, executor?: Executor): Promise<void> ";
    const body =
      "{ const run = async (tx: Executor) => { await tx.execute(query); }; if (executor) return run(executor); return drizzle.transaction(run);";
    const index = delegatedExecutorIndex(signature, body);
    expect(index).toBe(1);
    expect(
      delegatedExecutorIndex(
        signature,
        body.replace("if (executor)", "await drizzle.execute(query); if (executor)"),
      ),
    ).toBeUndefined();
    const calls = awaitedHelpers(
      "{ await revoke(user.id, tx); await revoke(user.id); await revoke(user.id, drizzle); await revoke(user.id, otherTx);",
    );
    expect(calls.map((call) => call.arguments[index!] === "tx")).toEqual([
      true,
      false,
      false,
      false,
    ]);
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
