/**
 * The unit lane never connects to a real database. vitest.config.ts points the
 * pool at a local address before the workers start; this stops a run in which
 * something put a remote one back (a shell profile, an env loader), instead of
 * letting an unmocked query reach it. It runs in every worker, before any test
 * file is imported. Real-database tests use `npm run test:db`.
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

for (const name of ["DATABASE_POOL_URL", "POSTGRES_URL", "DATABASE_URL"] as const) {
  const value = process.env[name]?.trim();
  if (!value) continue;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    throw new Error(`${name} is not a database address the unit tests can check. Unset it.`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `${name} points at a remote database. Unit tests must never reach one: unset it, or run npm run test:db for real-database tests.`,
    );
  }
}
