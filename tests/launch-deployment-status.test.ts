import { describe, expect, it, vi } from "vitest";
import {
  readLaunchDeployment,
  readLaunchWorker,
  resolveLaunchProvider,
} from "../scripts/lib/launch-deployment-status.mjs";

const revision = "a".repeat(40);
const previous = "b".repeat(40);
const workerReady = {
  ready: true,
  detail: "Authenticated readiness verified.",
  expected_source_revision: revision,
  worker_source_revision: revision,
  max_call_seconds: 3600,
};

function probes() {
  return {
    provider: resolveLaunchProvider([]),
    productionUrl: "https://botbound.app",
    expectedRevision: revision,
    readJson: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { alive: true, trafficEnabled: true, sourceCommit: revision },
    }),
    readWorker: vi.fn().mockResolvedValue(workerReady),
  };
}

describe("launch deployment selection", () => {
  it("defaults to Render and verifies both services", async () => {
    const input = probes();
    await expect(readLaunchDeployment(input)).resolves.toMatchObject({
      provider: "render",
      status: "ready",
      production_commit: revision,
      blockers: [],
    });
    expect(input.readJson).toHaveBeenCalledWith("https://botbound.app/healthz", {
      redirect: "error",
      cache: "no-store",
    });
    expect(input.readWorker).toHaveBeenCalledWith(revision);
  });

  it("rejects any non-Render provider selection", async () => {
    expect(() => resolveLaunchProvider(["--provider"])).toThrow("--provider must be");
    expect(() => resolveLaunchProvider(["--provider", "vercel"])).toThrow("--provider must be");
    expect(() => resolveLaunchProvider(["--provider", "unknown"])).toThrow("--provider must be");
  });

  it("blocks missing source identity before probing services", async () => {
    const input = { ...probes(), expectedRevision: "main" };
    await expect(readLaunchDeployment(input)).resolves.toMatchObject({
      status: "blocked",
      blockers: ["expected_release_revision_invalid"],
    });
    expect(input.readJson).not.toHaveBeenCalled();
    expect(input.readWorker).not.toHaveBeenCalled();
  });

  it.each([
    {
      body: { alive: true, trafficEnabled: true, sourceCommit: previous },
      blocker: "production_commit_mismatch",
    },
    {
      body: { alive: true, trafficEnabled: false, sourceCommit: revision },
      blocker: "render_traffic_disabled",
    },
    { body: { alive: true, sourceCommit: revision }, blocker: "render_release_identity_invalid" },
    {
      body: { alive: true, trafficEnabled: true, sourceCommit: "main" },
      blocker: "render_release_identity_invalid",
    },
    { body: null, blocker: "render_release_identity_invalid" },
  ])("rejects live API evidence: $blocker", async ({ body, blocker }) => {
    const input = probes();
    input.readJson.mockResolvedValue({ ok: true, status: 200, body });
    await expect(readLaunchDeployment(input)).resolves.toMatchObject({
      status: "blocked",
      blockers: [blocker],
    });
  });

  it("distinguishes an unreachable API from a confirmed source mismatch", async () => {
    const input = probes();
    input.readJson.mockResolvedValue({ ok: false, status: 503, body: null });
    await expect(readLaunchDeployment(input)).resolves.toMatchObject({
      blockers: ["render_unreachable"],
    });
  });

  it("does not let healthy public liveness certify an unverified voice worker", async () => {
    const input = probes();
    input.readWorker.mockResolvedValue({ ready: false, detail: "Authentication unavailable." });
    await expect(readLaunchDeployment(input)).resolves.toMatchObject({
      status: "blocked",
      blockers: ["voice_worker_not_ready"],
    });
  });
});

describe("authenticated launch worker proof", () => {
  it("pins the subprocess probe to the reviewed revision, overriding stale shell metadata", async () => {
    const run = vi.fn().mockReturnValue({ status: 0, stdout: JSON.stringify(workerReady) });
    expect(
      await readLaunchWorker(revision, {
        run,
        env: { WIRELINE_EXPECTED_SOURCE_REVISION: previous },
      }),
    ).toEqual(workerReady);
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      ["--import", "tsx", "scripts/check-voice-worker-readiness.mts"],
      expect.objectContaining({
        timeout: 20_000,
        env: { WIRELINE_EXPECTED_SOURCE_REVISION: revision },
      }),
    );
  });

  it.each([
    { status: 1, result: workerReady },
    { status: 0, result: { ...workerReady, ready: false } },
    { status: 0, result: { ...workerReady, worker_source_revision: previous } },
    { status: 0, result: { ...workerReady, expected_source_revision: previous } },
    { status: 0, result: { ...workerReady, max_call_seconds: 0 } },
    { status: 0, result: { ready: true } },
  ])(
    "requires successful authenticated source and duration proof %#",
    async ({ status, result }) => {
      const run = vi.fn().mockReturnValue({ status, stdout: JSON.stringify(result) });
      expect((await readLaunchWorker(revision, { run })).ready).toBe(false);
    },
  );

  it("redacts child process errors and invalid output", async () => {
    const secret = "private-credential-not-for-the-report";
    for (const run of [
      vi.fn().mockReturnValue({ status: 1, stdout: "bad JSON", stderr: secret }),
      vi.fn(() => {
        throw new Error(secret);
      }),
    ]) {
      const result = await readLaunchWorker(revision, { run });
      expect(result.ready).toBe(false);
      expect(JSON.stringify(result)).not.toContain(secret);
    }
  });
});
