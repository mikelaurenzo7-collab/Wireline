import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  reserve: vi.fn(),
  reconcile: vi.fn(),
  retain: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  fetchWithTimeout: h.fetch,
  log: { warn: vi.fn(), info: vi.fn() },
  drizzle: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{}] }) }) }) },
}));
vi.mock("../src/lib/openai-artifact-spend", () => ({
  reserveArtifactContainerSpend: h.reserve,
  reconcileArtifactContainerSpend: h.reconcile,
  retainAmbiguousArtifactContainerSpend: h.retain,
}));
vi.mock("../src/lib/connected-artifact-storage", () => ({
  uploadArtifactToConnectedStorage: h.upload,
}));
import { createAuditContext, runInAuditContext } from "../src/lib/ai-audit";
import { generateAndStorePostCallArtifact } from "../src/lib/openai-post-call-artifact";

const input = {
  userId: "tenant",
  callLogId: "call-1",
  outcomeTag: "completed",
  format: "pdf" as const,
  destination: "google_drive" as const,
};
const reservation = { auditId: 1n, userId: "tenant", costUsd: 0.03, adopted: false };
const payload = () => ({
  id: "resp_1",
  status: "completed",
  model: "gpt-5.6-terra",
  usage: {
    input_tokens: 1000,
    output_tokens: 100,
    input_tokens_details: { cached_tokens: 600, cache_write_tokens: 200 },
  },
  output: [
    { type: "code_interpreter_call", container_id: "cntr_1" },
    {
      type: "message",
      content: [
        {
          annotations: [
            {
              type: "container_file_citation",
              container_id: "cntr_1",
              file_id: "file_1",
              filename: "report.pdf",
            },
          ],
        },
      ],
    },
  ],
});
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "provider-test-key");
  vi.stubGlobal("fetch", h.fetch);
  h.fetch
    .mockReset()
    .mockResolvedValueOnce(new Response(JSON.stringify(payload())))
    .mockResolvedValueOnce(new Response("PDF bytes"));
  h.reserve.mockReset().mockResolvedValue(reservation);
  h.reconcile.mockReset().mockResolvedValue(["cntr_1"]);
  h.retain.mockReset().mockResolvedValue(undefined);
  h.upload
    .mockReset()
    .mockResolvedValue({ externalId: "stored", externalUrl: "https://example.test/report" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("artifact provider cost boundaries", () => {
  it("reserves before the fresh 1GB request and normalizes every cache bucket exactly once", async () => {
    const ctx = createAuditContext();
    await runInAuditContext(ctx, () => generateAndStorePostCallArtifact(input));
    expect(h.reserve).toHaveBeenCalledWith("tenant");
    expect(h.reserve.mock.invocationCallOrder[0]).toBeLessThan(h.fetch.mock.invocationCallOrder[0]);
    const request = JSON.parse(h.fetch.mock.calls[0][1].body);
    expect(request.tools).toEqual([
      { type: "code_interpreter", container: { type: "auto", memory_limit: "1g" } },
    ]);
    expect(request.previous_response_id).toBeUndefined();
    expect(request.conversation).toBeUndefined();
    expect(typeof request.input).toBe("string");
    expect(request.store).toBe(false);
    expect(ctx.records).toHaveLength(1);
    expect(ctx.records[0]).toMatchObject({
      input_tokens: 200,
      cache_read_tokens: 600,
      cache_create_tokens: 200,
      output_tokens: 100,
    });
    expect(h.reconcile).toHaveBeenCalledWith(reservation, payload(), 200);
  });
  it("makes no provider request if its cost receipt cannot be created", async () => {
    h.reserve.mockRejectedValueOnce(new Error("accounting unavailable"));
    await expect(generateAndStorePostCallArtifact(input)).rejects.toThrow("accounting unavailable");
    expect(h.fetch).not.toHaveBeenCalled();
  });
  it("retains the container estimate after an ambiguous provider timeout", async () => {
    h.fetch.mockReset().mockRejectedValueOnce(new Error("timeout"));
    await expect(generateAndStorePostCallArtifact(input)).rejects.toThrow("timeout");
    expect(h.retain).toHaveBeenCalledWith(reservation);
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("bounds a stalled JSON body after response headers and retains the uncertain container", async () => {
    vi.useFakeTimers();
    h.fetch.mockReset().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined),
      headers: new Headers(),
    });
    const work = generateAndStorePostCallArtifact(input);
    const rejected = expect(work).rejects.toThrow("timed out after 120000ms");
    await vi.advanceTimersByTimeAsync(120_001);
    await rejected;
    expect(h.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(h.retain).toHaveBeenCalledWith(reservation);
    expect(h.reconcile).not.toHaveBeenCalled();
  });
  it("bounds a stalled generated file body without losing its container accounting", async () => {
    vi.useFakeTimers();
    h.fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload())))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        arrayBuffer: () => new Promise(() => undefined),
      });
    const work = generateAndStorePostCallArtifact(input);
    const rejected = expect(work).rejects.toThrow("timed out after 30000ms");
    await vi.advanceTimersByTimeAsync(30_001);
    await rejected;
    expect(h.fetch.mock.calls[1][1].signal.aborted).toBe(true);
    expect(h.reconcile).toHaveBeenCalledOnce();
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("records billed model usage before failure to produce a native file", async () => {
    h.fetch
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...payload(), output: [] })));
    h.reconcile.mockResolvedValueOnce([]);
    const ctx = createAuditContext();
    await expect(
      runInAuditContext(ctx, () => generateAndStorePostCallArtifact(input)),
    ).rejects.toThrow("requested file");
    expect(ctx.records).toHaveLength(1);
    expect(h.upload).not.toHaveBeenCalled();
  });
  it("never downloads a cited file from a container absent from canonical tool execution", async () => {
    h.reconcile.mockResolvedValueOnce(["cntr_different"]);
    await expect(generateAndStorePostCallArtifact(input)).rejects.toThrow(
      "does not match an invoked container",
    );
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});
