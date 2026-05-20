import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  performMidCallVoiceSwap,
  shouldSwapForCall,
  clearSwapDedupe,
  _resetSwapDedupeForTests,
  _resolveControlUrlForTests,
} from "./vapi-voice-swap";

describe("performMidCallVoiceSwap", () => {
  const originalFetch = global.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    _resetSwapDedupeForTests();
  });

  it("refuses to swap when no secondary voice is provided", async () => {
    const result = await performMidCallVoiceSwap({
      call: { id: "call-abc" },
      detectedLanguage: "es",
      secondaryVoiceId: "",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no secondary voice/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to swap when the call has no id and no controlUrl", async () => {
    const result = await performMidCallVoiceSwap({
      call: {},
      detectedLanguage: "es",
      secondaryVoiceId: "maria-voice",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no call\.id or controlUrl/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("POSTs a handoff payload with the secondary voice to the control URL", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    const result = await performMidCallVoiceSwap({
      call: {
        id: "call-abc",
        monitor: { controlUrl: "https://westcoast.vapi.ai/call-abc/control" },
      },
      detectedLanguage: "es",
      secondaryVoiceId: "maria-voice",
    });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://westcoast.vapi.ai/call-abc/control");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.type).toBe("handoff");
    expect(body.destination.assistant.voice).toEqual({
      provider: "11labs",
      voiceId: "maria-voice",
      optimizeStreamingLatency: 4,
    });
    expect(body.destination.assistant.transcriber.language).toBe("es");
  });

  it("falls back to language=multi for unmapped ISO codes (Deepgram autodetect)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    await performMidCallVoiceSwap({
      call: { id: "call-xyz", monitor: { controlUrl: "https://x.vapi.ai/c/control" } },
      detectedLanguage: "xx",
      secondaryVoiceId: "any-voice",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.destination.assistant.transcriber.language).toBe("multi");
  });

  it("reports the upstream error when Vapi rejects the handoff", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => '{"message":"invalid voice"}',
    });
    const result = await performMidCallVoiceSwap({
      call: { id: "call-abc", controlUrl: "https://w.vapi.ai/c/control" },
      detectedLanguage: "es",
      secondaryVoiceId: "bad-voice",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/422/);
    expect(result.reason).toMatch(/invalid voice/);
  });

  it("respects the voiceProvider override (openai instead of 11labs)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "ok",
    });
    await performMidCallVoiceSwap({
      call: { id: "call-abc", controlUrl: "https://w.vapi.ai/c/control" },
      detectedLanguage: "fr",
      secondaryVoiceId: "alloy",
      voiceProvider: "openai",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.destination.assistant.voice.provider).toBe("openai");
  });
});

describe("shouldSwapForCall dedupe", () => {
  beforeEach(() => _resetSwapDedupeForTests());
  afterEach(() => _resetSwapDedupeForTests());

  it("returns true the first time per (callId, language)", () => {
    expect(shouldSwapForCall("call-1", "es")).toBe(true);
  });

  it("returns false on the second invocation with the same key", () => {
    expect(shouldSwapForCall("call-1", "es")).toBe(true);
    expect(shouldSwapForCall("call-1", "es")).toBe(false);
  });

  it("allows a different language on the same call (en->es->fr)", () => {
    expect(shouldSwapForCall("call-1", "es")).toBe(true);
    expect(shouldSwapForCall("call-1", "fr")).toBe(true);
  });

  it("allows the same language on a different call", () => {
    expect(shouldSwapForCall("call-1", "es")).toBe(true);
    expect(shouldSwapForCall("call-2", "es")).toBe(true);
  });

  it("clears the dedupe entries for a call when clearSwapDedupe is called", () => {
    shouldSwapForCall("call-1", "es");
    shouldSwapForCall("call-1", "fr");
    clearSwapDedupe("call-1");
    expect(shouldSwapForCall("call-1", "es")).toBe(true);
    expect(shouldSwapForCall("call-1", "fr")).toBe(true);
  });
});

describe("resolveControlUrl precedence", () => {
  it("prefers monitor.controlUrl over call.controlUrl and id-derived fallback", () => {
    expect(
      _resolveControlUrlForTests({
        id: "abc",
        monitor: { controlUrl: "https://monitor.vapi/abc/control" },
        controlUrl: "https://legacy.vapi/abc/control",
      }),
    ).toBe("https://monitor.vapi/abc/control");
  });

  it("falls back to call.controlUrl when monitor.controlUrl is absent", () => {
    expect(
      _resolveControlUrlForTests({
        id: "abc",
        controlUrl: "https://legacy.vapi/abc/control",
      }),
    ).toBe("https://legacy.vapi/abc/control");
  });

  it("falls back to the us-west-2 host when neither field is present", () => {
    expect(_resolveControlUrlForTests({ id: "abc" })).toMatch(/aws-us-west-2.*\/abc\/control$/);
  });

  it("returns null when there is no id and no controlUrl anywhere", () => {
    expect(_resolveControlUrlForTests({})).toBeNull();
  });
});
