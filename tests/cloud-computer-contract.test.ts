import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  cloudComputerConnection,
  cloudComputerModel,
  cloudComputerProcessCapacity,
  cloudComputerReadiness,
} from "../src/lib/cloud-computer/config";
import { ANTHROPIC_MODELS } from "../src/lib/ai-models";
import { quotaTokenDelta } from "../src/lib/managed-ai-operation-spend";

const read = (path: string) => readFileSync(path, "utf8");

describe("cloud computer production gates", () => {
  it("fails closed without a model key or an isolated browser", () => {
    expect(cloudComputerReadiness({})).toEqual({ available: false, reason: "model_unconfigured" });
    expect(cloudComputerReadiness({ ANTHROPIC_API_KEY: "k" })).toMatchObject({
      reason: "browser_unconfigured",
    });
  });

  it("requires an encrypted remote browser in production and never a local one", () => {
    expect(
      cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: "wss://browser.example/x" }, true),
    ).toEqual({ kind: "remote", wsEndpoint: "wss://browser.example/x" });
    expect(
      cloudComputerConnection({ CLOUD_COMPUTER_BROWSER_WS_URL: "ws://browser.example/x" }, true),
    ).toBeNull();
    expect(
      cloudComputerConnection({ CLOUD_COMPUTER_LOCAL_CHROMIUM_PATH: "/usr/bin/chromium" }, true),
    ).toBeNull();
    expect(
      cloudComputerConnection({ CLOUD_COMPUTER_LOCAL_CHROMIUM_PATH: "/usr/bin/chromium" }, false),
    ).toEqual({ kind: "local", executablePath: "/usr/bin/chromium" });
  });

  it("only runs allow-listed Claude models and bounds process capacity", () => {
    expect(cloudComputerModel({})).toBe(ANTHROPIC_MODELS.OPUS_5_5);
    expect(cloudComputerModel({ CLOUD_COMPUTER_MODEL: ANTHROPIC_MODELS.SONNET_5_5 })).toBe(
      ANTHROPIC_MODELS.SONNET_5_5,
    );
    expect(cloudComputerModel({ CLOUD_COMPUTER_MODEL: "gpt-unknown" })).toBe(
      ANTHROPIC_MODELS.OPUS_5_5,
    );
    expect(cloudComputerProcessCapacity({})).toBe(3);
    expect(cloudComputerProcessCapacity({ CLOUD_COMPUTER_MAX_CONCURRENT: "500" })).toBe(3);
  });
});

describe("cloud computer source contracts", () => {
  it("keeps Playwright and the Anthropic SDK off the API cold start", () => {
    for (const path of [
      "src/lib/cloud-computer/task-runner.ts",
      "src/lib/cloud-computer/config.ts",
      "src/lib/cloud-computer/agent.ts",
      "src/routes/computer-routes.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toMatch(/^import (?!type )[^;]*from "@anthropic-ai\/sdk";/m);
      expect(source, path).not.toMatch(/^import (?!type )[^;]*from "playwright-core";/m);
      expect(source, path).not.toMatch(/^import (?!type )[^;]*from "\.\/browser-session";/m);
    }
    expect(read("src/lib/cloud-computer/task-runner.ts")).toContain(
      'await import("./browser-session")',
    );
  });

  it("gates every task on ownership, a paid plan, live-action policy, and shared rate limits", () => {
    const runner = read("src/lib/cloud-computer/task-runner.ts");
    expect(runner).toContain("getAgentCoachingBrief");
    expect(runner).toContain('assertLiveExternalActionAllowed(userId, "computer.browse")');
    expect(runner).toContain("runWithManagedAiSpend");
    expect(runner).toContain("failClosedOnError: true");
    expect(runner).toMatch(/tenantStore\s*\.run\(userId/);
  });

  it("registers owner-authenticated routes only", () => {
    expect(read("src/server/register-api-routes.ts")).toContain("app.use(computerRouter)");
    const routes = read("src/routes/computer-routes.ts");
    const handlers = routes.match(/router\.(get|post)\(/g) ?? [];
    const authenticated = routes.match(/authenticateUser,/g) ?? [];
    expect(handlers.length).toBe(7);
    expect(authenticated.length).toBe(handlers.length);
  });

  it("ships the ledger with RLS, explicit grants, and account deletion coverage", () => {
    const migration = read("drizzle/migrations/0176_cloud_computer_tasks.sql");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("TO wireline_server");
    expect(migration).toContain("public.wireline_current_user_id()");
    expect(migration).toContain("REVOKE ALL ON TABLE public.wireline_computer_tasks FROM PUBLIC");
    expect(read("src/lib/account-deletion.ts")).toContain('table: "wireline_computer_tasks"');
    expect(read("drizzle/migrations/meta/_journal.json")).toContain("0176_cloud_computer_tasks");
  });

  it("never lets the planner run page scripts, upload files, or read network traffic", () => {
    const agent = read("src/lib/cloud-computer/agent.ts");
    for (const member of ["javascript_exec", "file_upload", "read_console", "read_network"]) {
      expect(agent).toMatch(new RegExp(`${member}: \\{ enabled: false \\}`));
    }
  });

  it("meters every provider attempt and keeps replayed cache reads from draining the quota", () => {
    const runner = read("src/lib/cloud-computer/task-runner.ts");
    expect(runner).toContain("usage.iterations");
    expect(runner).toContain('"fallback_message"');
    expect(runner).toContain("cacheReadQuotaWeight: CACHE_READ_QUOTA_WEIGHT");
    expect(read("src/lib/cloud-computer/config.ts")).toContain("maxRetries: 0");
    expect(
      quotaTokenDelta(
        {
          tokenDelta: 1_100_000,
          inputTokens: 50_000,
          outputTokens: 20_000,
          cacheReadTokens: 1_000_000,
          cacheCreateTokens: 30_000,
          latencyMs: 0,
        },
        0.1,
      ),
    ).toBe(200_000);
    expect(
      quotaTokenDelta({
        tokenDelta: 1_100_000,
        inputTokens: 50_000,
        outputTokens: 20_000,
        cacheReadTokens: 1_000_000,
        cacheCreateTokens: 30_000,
        latencyMs: 0,
      }),
    ).toBe(1_100_000);
  });

  it("enforces one active task per account in the database and stops across processes", () => {
    const migration = read("drizzle/migrations/0176_cloud_computer_tasks.sql");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_computer_tasks_one_active_per_user",
    );
    expect(migration).toContain("WHERE status IN ('running', 'needs_input')");
    const runner = read("src/lib/cloud-computer/task-runner.ts");
    expect(runner).toContain('getPostgresErrorCode(error) === "23505"');
    // persist only writes active rows; an unmatched write is the stop signal.
    expect(runner).toMatch(
      /inArray\(schema\.computerTasks\.status, ACTIVE_STATUSES\),\s*\)\s*,?\s*\)\s*\.returning/,
    );
  });
});
