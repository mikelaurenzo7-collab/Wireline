import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { drainVoice } from "../deploy/render/drain-voice.mjs";
import { runCron } from "../deploy/render/cron.mjs";

const revision = "a".repeat(40);
const otherRevision = "b".repeat(40);
const drainEnv = {
  WIRELINE_VOICE_WORKER_URL: "https://voice.example.com",
  WIRELINE_VOICE_WORKER_SECRET: "test-credential-".repeat(3),
  VOICE_DRAIN_EXPECTED_REVISION: revision,
};
const state = (overrides = {}) => ({
  draining: true,
  active: 0,
  pending: 0,
  source_revision: revision,
  max_call_seconds: 3600,
  ...overrides,
});
const json = (body, status = 200) => Response.json(body, { status });

describe("operator voice drain", () => {
  it("resumes observation after a failed poll without repeating admission shutdown or readiness", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(state({ draining: false })))
      .mockResolvedValueOnce(
        json({ ready: true, source_revision: revision, max_call_seconds: 3600 }),
      )
      .mockResolvedValueOnce(json(state({ pending: 1 })))
      .mockRejectedValueOnce(new Error("connection interrupted"))
      .mockResolvedValueOnce(json(state({ pending: 1 })))
      .mockResolvedValueOnce(json(state()));
    const options = { env: drainEnv, fetchImpl, sleep: vi.fn(), log: vi.fn() };
    await expect(drainVoice(options)).rejects.toThrow("connection interrupted");
    await expect(drainVoice(options)).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls.map(([url, init]) => `${init.method} ${url.pathname}`)).toEqual([
      "GET /drain",
      "GET /readyz",
      "POST /drain",
      "GET /drain",
      "GET /drain",
      "GET /drain",
    ]);
    expect(fetchImpl.mock.calls[2][1].headers["x-botbound-expected-source-revision"]).toBe(
      revision,
    );
    expect(options.log).toHaveBeenLastCalledWith(
      JSON.stringify({ drained: true, source_revision: revision }),
    );
  });
  it.each([
    { source_revision: otherRevision },
    { source_revision: null },
    { max_call_seconds: 0 },
    { pending: -1 },
    { active: 0.5 },
  ])("does not certify invalid initial drain evidence %j", async (invalid) => {
    const fetchImpl = vi.fn().mockResolvedValue(json(state(invalid)));
    await expect(drainVoice({ env: drainEnv, fetchImpl, log: vi.fn() })).rejects.toThrow(
      "Invalid drain",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("refuses a different worker revision appearing during polling", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(state({ active: 1 })))
      .mockResolvedValueOnce(json(state({ source_revision: otherRevision })));
    await expect(
      drainVoice({ env: drainEnv, fetchImpl, sleep: vi.fn(), log: vi.fn() }),
    ).rejects.toThrow("Invalid drain");
  });
  it("leaves unfinished work running when its observation deadline expires", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json(state({ pending: 1 })));
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(3_900_000);
    await expect(drainVoice({ env: drainEnv, fetchImpl, now, log: vi.fn() })).rejects.toThrow(
      "leave the old worker running",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

const cronEnv = {
  RENDER: "true",
  IS_PULL_REQUEST: "false",
  RENDER_GIT_BRANCH: "main",
  RENDER_GIT_COMMIT: revision,
  WIRELINE_SOURCE_REVISION: revision,
  WIRELINE_DEPLOYMENT_ENVIRONMENT: "production",
  NODE_ENV: "production",
  RENDER_CRON_ENABLED: "true",
  BOTBOUND_BACKEND_ORIGIN: "https://api.example.com",
  CRON_SECRET: "test-cron-secret-credential",
};
describe("scheduler release parity", () => {
  it("does no network work while disabled", async () => {
    const fetchImpl = vi.fn();
    await runCron("jobs-sweep", { env: {}, fetchImpl, log: vi.fn() });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    { IS_PULL_REQUEST: "true" },
    { RENDER_GIT_BRANCH: "codex/test" },
    { WIRELINE_SOURCE_REVISION: otherRevision },
    { VERCEL_ENV: "production" },
  ])("rejects an unverified runtime %j", async (overrides) => {
    const fetchImpl = vi.fn();
    await expect(
      runCron("jobs-sweep", { env: { ...cronEnv, ...overrides }, fetchImpl }),
    ).rejects.toThrow("verified Render");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([{ sourceCommit: otherRevision }, { trafficEnabled: false }])(
    "does not execute against an incompatible API %j",
    async (overrides) => {
      const fetchImpl = vi.fn().mockResolvedValue(
        json({
          alive: true,
          trafficEnabled: true,
          sourceCommit: revision,
          ...overrides,
        }),
      );
      await expect(runCron("jobs-sweep", { env: cronEnv, fetchImpl })).rejects.toThrow(
        "API traffic or source",
      );
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it("sends its verified revision with the authenticated job and never retries an API replacement", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ alive: true, trafficEnabled: true, sourceCommit: revision }))
      .mockResolvedValueOnce(json({ code: "DEPLOYMENT_REVISION_MISMATCH" }, 409));
    await expect(runCron("daily-brief", { env: cronEnv, fetchImpl })).rejects.toThrow("HTTP 409");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, options] = fetchImpl.mock.calls[1];
    expect(url.pathname).toBe("/api/daily-brief/schedule");
    expect(options.headers).toMatchObject({
      Authorization: `Bearer ${cronEnv.CRON_SECRET}`,
      "x-botbound-expected-source-revision": revision,
    });
    expect(options.redirect).toBe("error");
  });
  it.each(["jobs-sweep", "daily-brief"])(
    "binds the %s build to its clean checkout and rejects the wrong artifact",
    (role) => {
      const root = mkdtempSync(join(tmpdir(), "botbound-cron-release-test-"));
      if (
        !resolve(root).startsWith(resolve(tmpdir()) + sep) ||
        !root.includes("botbound-cron-release-test-")
      )
        throw new Error("Unexpected temporary test path.");
      try {
        mkdirSync(join(root, "deploy/render"), { recursive: true });
        for (const file of ["build.mjs", "start.mjs", "cron.mjs", "public-output.mjs"])
          copyFileSync(resolve("deploy/render", file), join(root, "deploy/render", file));
        writeFileSync(join(root, ".gitignore"), "dist/\n");
        const git = (...args) => {
          const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
          expect(result.status, result.stderr).toBe(0);
          return result.stdout.trim();
        };
        git("init", "--quiet");
        git("add", ".");
        git(
          "-c",
          "user.name=Release test",
          "-c",
          "user.email=release-test@example.invalid",
          "-c",
          "commit.gpgsign=false",
          "commit",
          "--quiet",
          "-m",
          "fixture",
        );
        const sha = git("rev-parse", "HEAD");
        const env = {
          ...process.env,
          ...cronEnv,
          RENDER_CRON_ENABLED: "false",
          RENDER_GIT_COMMIT: sha,
        };
        for (const key of [
          "VERCEL",
          "VERCEL_ENV",
          "VERCEL_GIT_COMMIT_REF",
          "VERCEL_GIT_COMMIT_SHA",
          "WIRELINE_VOICE_WORKER",
        ])
          delete env[key];
        const run = (script, selectedRole = role, overrides = {}) =>
          spawnSync(process.execPath, [`deploy/render/${script}.mjs`, selectedRole], {
            cwd: root,
            env: { ...env, ...overrides },
            encoding: "utf8",
          });
        const build = run("build");
        expect(build.status, build.stderr).toBe(0);
        expect(JSON.parse(readFileSync(join(root, "dist/render-release.json"), "utf8"))).toEqual({
          role,
          revision: sha,
        });
        const started = run("start");
        expect(started.status, started.stderr).toBe(0);
        expect(JSON.parse(started.stdout)).toMatchObject({ job: role, skipped: true });
        expect(run("start", role, { RENDER_GIT_COMMIT: otherRevision }).status).toBe(1);
        expect(run("start", role === "jobs-sweep" ? "daily-brief" : "jobs-sweep").status).toBe(1);
        expect(run("cron").status).toBe(1);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
