#!/usr/bin/env node
// Bootstrap smoke test — spawns the built server, hits /api/health,
// asserts the process stays alive, then kills it cleanly.
//
// Catches:
//  - ESM/CJS extension mismatches (the original "Wireline run failed" bug)
//  - Top-level import-time crashes
//  - Missing-module errors at runtime that the bundler missed
//  - Health endpoint regressions
//
// Runs in CI after the build step so a broken bundle fails the pipeline
// rather than reaching production.

import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';

const PORT = process.env.SMOKE_PORT || '3456';
const HEALTH_URL = `http://localhost:${PORT}/api/health`;
// /api/health does a DB probe with a 1.5s timeout, so each request can
// take up to ~1.6s. Allow plenty of headroom on cold-start.
const STARTUP_BUDGET_MS = 15_000;
const POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 3_000;

const child = spawn(process.execPath, ['dist/server.cjs'], {
  env: {
    ...process.env,
    PORT,
    NODE_ENV: 'production',
    // Health check probes the DB; without a real POSTGRES_URL it returns 503
    // but the process should still be alive — that's all we're testing here.
    POSTGRES_URL: process.env.POSTGRES_URL || 'postgres://placeholder:placeholder@localhost:5432/placeholder',
    // Prod-required by requireSecret() / validateStartupEnv — provide placeholders
    // so the server starts during CI where real secrets are absent.
    INTERNAL_JWT_SECRET: process.env.INTERNAL_JWT_SECRET || 'smoke-test-placeholder-32-chars-minimum',
    OAUTH_STATE_SECRET:  process.env.OAUTH_STATE_SECRET  || 'smoke-test-placeholder',
    STRIPE_SECRET_KEY:   process.env.STRIPE_SECRET_KEY   || 'sk_test_placeholder',
    GEMINI_API_KEY:      process.env.GEMINI_API_KEY      || 'placeholder',
    ANTHROPIC_API_KEY:   process.env.ANTHROPIC_API_KEY   || 'placeholder',
    VAPI_PRIVATE_KEY:    process.env.VAPI_PRIVATE_KEY    || 'placeholder',
    VAPI_WEBHOOK_SECRET: process.env.VAPI_WEBHOOK_SECRET || 'placeholder',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let exited = false;
let exitCode = null;
child.on('exit', (code, signal) => {
  exited = true;
  exitCode = code ?? signal;
});

const stdout = [];
const stderr = [];
child.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

async function probe() {
  const deadline = Date.now() + STARTUP_BUDGET_MS;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `Server crashed before health probe could connect (exit=${exitCode}).\n` +
          `STDOUT:\n${stdout.join('').slice(-1500)}\n` +
          `STDERR:\n${stderr.join('').slice(-1500)}`,
      );
    }
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      // 200 (healthy) or 503 (degraded, e.g. DB unreachable in CI) both
      // mean the server is up and responding. We only fail on no-response.
      if (res.status === 200 || res.status === 503) {
        return res.status;
      }
      throw new Error(`Health endpoint returned unexpected status ${res.status}`);
    } catch {
      // Connection refused / timeout — server hasn't bound yet, retry
      await wait(POLL_INTERVAL_MS);
    }
  }
  throw new Error(
    `Server did not respond within ${STARTUP_BUDGET_MS}ms.\n` +
      `STDOUT:\n${stdout.join('').slice(-1500)}\n` +
      `STDERR:\n${stderr.join('').slice(-1500)}`,
  );
}

let ok = false;
let probeError = null;
try {
  const status = await probe();
  console.log(`✓ Server bootstrapped — /api/health responded ${status}`);
  ok = true;
} catch (err) {
  probeError = err;
  console.error(`✗ Smoke test failed: ${err.message}`);
}

// Clean shutdown: SIGTERM lets the graceful shutdown handler drain.
if (!exited) {
  child.kill('SIGTERM');
  // Force-kill if it doesn't exit within 3s
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    wait(3_000).then(() => child.kill('SIGKILL')),
  ]);
}

process.exit(ok ? 0 : 1);
