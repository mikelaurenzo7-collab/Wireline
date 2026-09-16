import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetch: vi.fn(),
  enqueue: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  fetchWithTimeout: h.fetch,
  log: h.log,
}));
vi.mock("../src/lib/job-queue", () => ({ enqueue: h.enqueue }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertLiveExternalActionAllowed: vi.fn(),
  assertPrivateVoiceSimulationAllowed: vi.fn(),
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({
    perform,
  }: {
    perform: () => Promise<unknown>;
  }) => ({ performed: true, result: await perform() }),
}));

import { createServerManagedOpenAIRealtimeCall } from "../src/lib/voice/openai-realtime-call-control";
import { shouldRetainRealtimeReservation } from "../src/lib/realtime-provider-outcome";

const offer = [
  "v=0",
  "o=- 123456789 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0 1",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111",
  "c=IN IP4 0.0.0.0",
  "a=mid:0",
  "a=rtpmap:111 opus/48000/2",
  "a=sendrecv",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "a=mid:1",
  "a=sctp-port:5000",
  "",
].join("\r\n");

const input = {
  userId: "11111111-1111-4111-8111-111111111111",
  sdp: offer,
  session: { type: "realtime", model: "test-only-model" },
  maxDurationSeconds: 300,
  admission: "private_simulation" as const,
};
const callHeaders = { location: "https://api.openai.com/v1/realtime/calls/rtc_test" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test-runtime-key");
  h.enqueue.mockResolvedValue({ ok: true, jobId: "hangup-job" });
  h.fetch.mockImplementation(async (url: string) => {
    if (url.endsWith("/client_secrets")) return Response.json({ value: "test-ephemeral-key" });
    if (url.endsWith("/hangup")) return new Response(null, { status: 200 });
    return new Response(offer, { status: 201, headers: callHeaders });
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("server-managed Realtime signaling failures", () => {
  it("preserves the browser offer's final CRLF for strict SDP parsers", async () => {
    h.fetch.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/client_secrets")) return Response.json({ value: "test-ephemeral-key" });
      if (!String(init.body).endsWith("\r\n")) return new Response(null, { status: 400 });
      return new Response(offer, { status: 201, headers: callHeaders });
    });
    await expect(createServerManagedOpenAIRealtimeCall(input)).resolves.toMatchObject({
      callId: "rtc_test",
      sdp: offer,
    });
    expect(h.fetch.mock.calls[1][1].body).toBe(offer);
    expect(h.enqueue).toHaveBeenCalledOnce();
  });

  it("rejects an invalid offer before any provider request", async () => {
    await expect(
      createServerManagedOpenAIRealtimeCall({ ...input, sdp: "invalid" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("hangs up a created call when its answer is malformed", async () => {
    h.fetch
      .mockResolvedValueOnce(Response.json({ value: "test-ephemeral-key" }))
      .mockResolvedValueOnce(new Response("invalid SDP", { status: 201, headers: callHeaders }));
    const error = await createServerManagedOpenAIRealtimeCall(input).catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({ status: 502 });
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.fetch.mock.calls[2][0]).toMatch(/\/rtc_test\/hangup$/);
    expect(h.fetch.mock.calls[2][1].headers.Authorization).toBe("Bearer test-runtime-key");
    expect(shouldRetainRealtimeReservation(error)).toBe(false);
    expect(h.enqueue).not.toHaveBeenCalled();
  });

  it("hangs up a created call if reading its answer fails", async () => {
    const response = new Response(offer, { status: 201, headers: callHeaders });
    vi.spyOn(response, "text").mockRejectedValue(new Error("private transport details"));
    h.fetch
      .mockResolvedValueOnce(Response.json({ value: "test-ephemeral-key" }))
      .mockResolvedValueOnce(response);
    const error = await createServerManagedOpenAIRealtimeCall(input).catch(
      (error: unknown) => error,
    );
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(h.fetch.mock.calls[2][0]).toMatch(/\/rtc_test\/hangup$/);
    expect(shouldRetainRealtimeReservation(error)).toBe(false);
    expect(JSON.stringify(h.log.error.mock.calls)).not.toContain("private transport details");
  });

  it("retains spend when a malformed answer cannot be safely hung up", async () => {
    h.fetch
      .mockResolvedValueOnce(Response.json({ value: "test-ephemeral-key" }))
      .mockResolvedValueOnce(new Response("invalid SDP", { status: 201, headers: callHeaders }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const error = await createServerManagedOpenAIRealtimeCall(input).catch(
      (error: unknown) => error,
    );
    expect(h.fetch).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({ status: 502 });
    expect(shouldRetainRealtimeReservation(error)).toBe(true);
  });

  it("still hangs up immediately when durable deadline scheduling fails", async () => {
    h.enqueue.mockRejectedValue(new Error("database unavailable"));
    const error = await createServerManagedOpenAIRealtimeCall(input).catch(
      (error: unknown) => error,
    );
    expect(error).toMatchObject({ status: 503 });
    expect(h.fetch.mock.calls[2][0]).toMatch(/\/rtc_test\/hangup$/);
    expect(shouldRetainRealtimeReservation(error)).toBe(false);
  });

  it.each([
    { status: 400, retain: false },
    { status: 503, retain: true },
  ])("preserves the spend classification for provider HTTP $status", async ({ status, retain }) => {
    h.fetch
      .mockResolvedValueOnce(Response.json({ value: "test-ephemeral-key" }))
      .mockResolvedValueOnce(new Response(null, { status }));
    const error = await createServerManagedOpenAIRealtimeCall(input).catch(
      (error: unknown) => error,
    );
    expect(shouldRetainRealtimeReservation(error)).toBe(retain);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(h.enqueue).not.toHaveBeenCalled();
  });
});
