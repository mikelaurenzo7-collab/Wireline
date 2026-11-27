import path from "node:path";
import { defineConfig } from "vitest/config";

// Import-only tests construct the shared database pool but never connect to it.
// The unit lane must not reach a real database or provider even when the shell
// that starts it exports production credentials. It did on one machine: with
// the address only defaulted here, and the pool preferring DATABASE_POOL_URL,
// unit runs on 2026-11-26 and 27 ran locking queries against production. So
// the local address is set, not defaulted, and every live credential is
// removed before the workers fork. Real-database tests have their own lane:
// npm run test:db.
const LOCAL_TEST_DATABASE_URL = "postgresql://wireline:wireline@127.0.0.1:5432/wireline";
const LIVE_CREDENTIAL =
  /^(?:DATABASE_|POSTGRES_|SUPABASE_|TWILIO_|STRIPE_|RESEND_|AGENTMAIL_|XAI_|OPENAI_|ELEVENLABS_|CARTESIA_|BROWSERBASE_|PERPLEXITY_|RENDER_|UPSTASH_|SENTRY_|WIRELINE_VOICE_WORKER_|INTERNAL_JWT_|WIRELINE_DATA_KEY)/;
for (const name of Object.keys(process.env)) {
  if (LIVE_CREDENTIAL.test(name)) delete process.env[name];
}
process.env.POSTGRES_URL = LOCAL_TEST_DATABASE_URL;

export default defineConfig({
  resolve: {
    alias: [
      { find: "@/src", replacement: path.resolve(__dirname, "src") },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  test: {
    environment: "node",
    setupFiles: [
      "./tests/setup/local-database-only.ts",
      "./tests/setup/canonical-schema-source.ts",
    ],
    // forks trades a little speed for process-level isolation. vmThreads had
    // non-deterministic module-mock leakage across test files (e.g. mocked
    // DB/imap modules executing real queries), which is unacceptable for a
    // launch-ready gate.
    pool: "forks",
    // The repository contains isolated applications (for example the Remotion
    // film workspace) with their own dependency trees. Match these directories
    // at any depth so a local app install cannot leak third-party test files
    // into the root release gate.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/e2e/**/*.spec.ts",
      // The real-database lane runs on its own: npm run test:db.
      "tests/db/**",
      "**/.worktrees/**",
      "tmp/**",
      ".tmp/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        // Five percent is the first honest repository-wide floor for a large
        // codebase whose historic suite leaned heavily on source contracts.
        // It fails regressions today without pretending broad behavioral
        // coverage exists; future releases should ratchet this upward.
        lines: 5,
        functions: 5,
        branches: 5,
        statements: 5,
      },
    },
  },
});
