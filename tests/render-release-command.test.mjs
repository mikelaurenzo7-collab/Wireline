import { describe, expect, it, vi } from "vitest";
import { runRelease } from "../deploy/render/release.mjs";

const current = "a".repeat(40);
const candidate = "b".repeat(40);
const repo = "https://github.com/mikelaurenzo7-collab/Wireline";
const voiceOrigin = "https://botbound-voice.onrender.com";
const serviceNames = {
  "srv-daqamngu01pc73ffteeg": "botbound-api",
  "srv-daqaoo97lnhs73cbapeg": "botbound-voice",
  "crn-darv1k3bc2fs738lnr5g": "botbound-jobs-sweep",
  "crn-darv1n17lnhs73ev5qm0": "botbound-daily-brief",
};
const env = {
  RENDER_API_KEY: "mock-render",
  WIRELINE_VOICE_WORKER_SECRET: "fake-worker-credential-".repeat(3),
};

function fixture({
  liveRevision = current,
  mainRevision = () => liveRevision,
  cronRevision = liveRevision,
  workerRevision = liveRevision,
  queued = false,
  initiallyDraining = false,
  pendingAfterDrain = 0,
  changedVoiceDeploy = false,
} = {}) {
  const git = vi.fn((args, gitEnv) => {
    expect(gitEnv.RENDER_API_KEY).toBeUndefined();
    expect(gitEnv.WIRELINE_VOICE_WORKER_SECRET).toBeUndefined();
    if (args[0] === "remote") return repo + ".git";
    if (args[0] === "rev-parse") return candidate;
    if (args[0] === "ls-remote") return `${mainRevision()}\trefs/heads/main`;
    return "";
  });
  let draining = initiallyDraining;
  let voiceLists = 0;
  const fetchImpl = vi.fn(async (url, init) => {
    expect(init.redirect).toBe("error");
    if (url.origin === "https://api.render.com") {
      expect(init.headers.Authorization).toBe(`Bearer ${env.RENDER_API_KEY}`);
      expect(init.headers["x-botbound-voice-worker-key"]).toBeUndefined();
      const [, , , id, action] = url.pathname.split("/");
      const name = serviceNames[id];
      if (!name) throw new Error("Unexpected service");
      if (action === "deploys") {
        expect(url.searchParams.getAll("status")).toContain("queued");
        if (name === "botbound-voice") voiceLists++;
        const deployed = id.startsWith("crn-") ? cronRevision : liveRevision;
        return Response.json([
          ...(name === "botbound-voice" && queued ? [{ deploy: { status: "queued" } }] : []),
          {
            deploy: {
              id:
                "dep-" +
                (changedVoiceDeploy && name === "botbound-voice" && voiceLists > 1
                  ? "new"
                  : id.slice(4)),
              status: "live",
              commit: { id: deployed },
            },
          },
        ]);
      }
      return Response.json({
        id,
        name,
        branch: "main",
        ownerId: "tea-d6cgo7kr85hc738l3lh0",
        repo,
        autoDeployTrigger: name === "botbound-voice" ? "off" : "commit",
        serviceDetails: { url: voiceOrigin },
      });
    }
    expect(init.headers.Authorization).toBeUndefined();
    if (url.origin === "https://botbound.app" && url.pathname === "/healthz") {
      expect(init.headers["x-botbound-voice-worker-key"]).toBeUndefined();
      return Response.json({ alive: true, trafficEnabled: true, sourceCommit: liveRevision });
    }
    if (url.origin !== voiceOrigin) throw new Error("Unexpected voice destination");
    expect(init.headers["x-botbound-voice-worker-key"]).toBe(env.WIRELINE_VOICE_WORKER_SECRET);
    expect(init.headers["x-botbound-expected-source-revision"]).toBe(liveRevision);
    if (url.pathname === "/readyz") {
      return Response.json({
        ready: !draining,
        source_revision: workerRevision,
        max_call_seconds: 3600,
      });
    }
    if (url.pathname !== "/drain") throw new Error("Unexpected voice route");
    const startedNow = init.method === "POST";
    if (startedNow) draining = true;
    return Response.json({
      draining,
      active: draining ? 0 : 1,
      pending: startedNow ? pendingAfterDrain : 0,
      source_revision: workerRevision,
      max_call_seconds: 3600,
    });
  });
  return { git, fetchImpl, env, sleep: vi.fn(), log: vi.fn() };
}

describe("Render release operator", () => {
  it("plans against four exact deployed revisions using read-only requests", async () => {
    const h = fixture();
    const result = await runRelease({ ...h, args: ["plan", current, candidate] });
    expect(result.deployments.map(({ service, revision }) => [service, revision])).toEqual(
      Object.values(serviceNames).map((name) => [name, current]),
    );
    expect(result.voice).toEqual({ draining: false, active: 1, pending: 0 });
    expect(h.fetchImpl.mock.calls.some(([, init]) => init.method === "POST")).toBe(false);
  });

  it.each([
    [{ cronRevision: candidate }, "is not live"],
    [{ queued: true }, "queued, active, or unknown"],
    [{ workerRevision: candidate }, "Invalid drain identity"],
    [{ mainRevision: () => candidate }, "GitHub main changed"],
  ])("blocks the drain on inconsistent release evidence", async (scenario, reason) => {
    const h = fixture(scenario);
    await expect(runRelease({ ...h, args: ["drain", current, candidate] })).rejects.toThrow(reason);
    expect(h.fetchImpl.mock.calls.some(([, init]) => init.method === "POST")).toBe(false);
  });

  it("certifies a single drain only after pending work reaches zero", async () => {
    const h = fixture({ pendingAfterDrain: 1 });
    await expect(runRelease({ ...h, args: ["drain", current, candidate] })).resolves.toMatchObject({
      voice: { draining: true, active: 0, pending: 0 },
    });
    expect(h.sleep).toHaveBeenCalledOnce();
    expect(h.fetchImpl.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });

  it("rechecks main immediately before changing voice admission", async () => {
    const h = fixture({
      mainRevision: vi.fn().mockReturnValueOnce(current).mockReturnValue(candidate),
    });
    await expect(runRelease({ ...h, args: ["drain", current, candidate] })).rejects.toThrow(
      "GitHub main changed",
    );
    expect(h.fetchImpl.mock.calls.some(([, init]) => init.method === "POST")).toBe(false);
  });

  it("resumes an existing drain without posting another admission change", async () => {
    const h = fixture({ initiallyDraining: true });
    await expect(runRelease({ ...h, args: ["drain", current, candidate] })).resolves.toMatchObject({
      voice: { draining: true, active: 0, pending: 0 },
    });
    expect(h.fetchImpl.mock.calls.some(([, init]) => init.method === "POST")).toBe(false);
  });

  it("rejects a replacement with the same source after the old worker was drained", async () => {
    const h = fixture({ changedVoiceDeploy: true });
    await expect(runRelease({ ...h, args: ["drain", current, candidate] })).rejects.toThrow(
      "A Render deploy changed",
    );
  });

  it("verifies the new live release and rejects a new worker still in drain", async () => {
    await expect(
      runRelease({ ...fixture({ liveRevision: candidate }), args: ["verify", candidate] }),
    ).resolves.toMatchObject({ mode: "verify", current: candidate, voice: { draining: false } });
    await expect(
      runRelease({
        ...fixture({ liveRevision: candidate, initiallyDraining: true }),
        args: ["verify", candidate],
      }),
    ).rejects.toThrow("still draining");
  });
});
