import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createElevenLabsVoiceClient,
  ELEVENLABS_VOICE_PREVIEW,
  ElevenLabsVoiceError,
} from "../src/lib/voice/elevenlabs-voice-client";

const KEY = "private-test-vendor-key";
const ID = "clone_voice_123";
const clone = () => ({
  name: "Founder voice",
  samples: [{ bytes: new Uint8Array(32).fill(1), mimeType: "audio/wav" }],
});
const voice = () => ({
  voice_id: ID,
  name: "Founder voice",
  category: "cloned",
  voice_verification: { requires_verification: true, is_verified: false },
  samples: [{ recording: "private-source-audio", transcription: "private spoken text" }],
  preview_url: "https://private.example/recording",
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function setup(response: Response = json(voice()), timeoutMs = 1_000) {
  const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { fetchImpl, client: createElevenLabsVoiceClient({ apiKey: KEY, fetchImpl, timeoutMs }) };
}
async function failure(promise: Promise<unknown>): Promise<ElevenLabsVoiceError> {
  const result = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(result).toBeInstanceOf(ElevenLabsVoiceError);
  return result as ElevenLabsVoiceError;
}

afterEach(() => vi.useRealTimers());

describe("ElevenLabs voice transport foundation", () => {
  it("creates a clone with bounded multipart samples and preserves verification requirements", async () => {
    const { client, fetchImpl } = setup(json({ voice_id: ID, requires_verification: true }));
    await expect(
      client.createInstantClone({ ...clone(), description: "Owner-approved sample" }),
    ).resolves.toEqual({
      voiceId: ID,
      requiresVerification: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/voices/add");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { "xi-api-key": KEY },
    });
    const form = init?.body as FormData;
    expect(form.get("name")).toBe("Founder voice");
    expect(form.get("description")).toBe("Owner-approved sample");
    expect(form.get("remove_background_noise")).toBe("false");
    const files = form.getAll("files") as File[];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("sample-1.wav");
    expect(files[0].type).toBe("audio/wav");
    expect(new Uint8Array(await files[0].arrayBuffer())).toEqual(clone().samples[0].bytes);
    expect(new Headers(init?.headers).get("Content-Type")).toBeNull();
  });

  it("does not mistake absent verification state for an approved clone", async () => {
    const { client, fetchImpl } = setup(json({ voice_id: ID }));
    expect(await failure(client.createInstantClone(clone()))).toMatchObject({
      code: "INVALID_RESPONSE",
      operation: "create",
      providerMayHaveAccepted: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "accepts an explicit requires_verification=%s",
    async (requiresVerification) => {
      const { client } = setup(json({ voice_id: ID, requires_verification: requiresVerification }));
      expect(await client.createInstantClone(clone())).toEqual({
        voiceId: ID,
        requiresVerification,
      });
    },
  );

  it("returns only minimal voice metadata and leaves unknown verification unknown", async () => {
    const { client, fetchImpl } = setup();
    expect(await client.getVoice(ID)).toEqual({
      voiceId: ID,
      name: "Founder voice",
      category: "cloned",
      requiresVerification: true,
      verified: false,
    });
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://api.elevenlabs.io/v1/voices/${ID}`);
    const second = setup(json({ voice_id: ID, name: "Unverified voice" }));
    expect(await second.client.getVoice(ID)).toEqual({
      voiceId: ID,
      name: "Unverified voice",
      category: null,
      requiresVerification: null,
      verified: null,
    });
  });

  it.each([{}, { name: null }])(
    "accepts an optional missing or null voice name from lookup",
    async (optionalName) => {
      const result = await setup(json({ voice_id: ID, ...optionalName })).client.getVoice(ID);
      expect(result).toEqual({
        voiceId: ID,
        name: null,
        category: null,
        requiresVerification: null,
        verified: null,
      });
    },
  );

  it.each([{}, { name: null }])(
    "preserves unnamed voices in an otherwise valid page",
    async (optionalName) => {
      const result = await setup(
        json({
          voices: [voice(), { voice_id: "unnamed_voice", ...optionalName }],
          has_more: false,
        }),
      ).client.listVoices();
      expect(result.voices).toHaveLength(2);
      expect(result.voices[1]).toEqual({
        voiceId: "unnamed_voice",
        name: null,
        category: null,
        requiresVerification: null,
        verified: null,
      });
    },
  );

  it("retains reliable pagination without exposing sample recordings or verification transcripts", async () => {
    const { client, fetchImpl } = setup(
      json({ voices: [voice()], has_more: true, next_page_token: "next+/=token" }),
    );
    const result = await client.listVoices({ pageSize: 50, nextPageToken: "previous+/=token" });
    expect(result).toEqual({
      voices: [
        {
          voiceId: ID,
          name: "Founder voice",
          category: "cloned",
          requiresVerification: true,
          verified: false,
        },
      ],
      hasMore: true,
      nextPageToken: "next+/=token",
    });
    expect(JSON.stringify(result)).not.toContain("private");
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe("https://api.elevenlabs.io/v2/voices");
    expect(url.searchParams.get("page_size")).toBe("50");
    expect(url.searchParams.get("next_page_token")).toBe("previous+/=token");
    expect(url.searchParams.get("include_total_count")).toBe("false");
  });

  it.each([
    { voices: [voice()], has_more: true },
    { voices: [{ voice_id: "bad/id", name: "Invalid" }], has_more: false },
    { voices: {}, has_more: false },
    { voices: [], has_more: "false" },
  ])("rejects malformed list responses", async (body) => {
    expect(await failure(setup(json(body)).client.listVoices())).toMatchObject({
      code: "INVALID_RESPONSE",
      providerMayHaveAccepted: false,
    });
  });

  it("rejects a voice returned for a different resource", async () => {
    expect(
      await failure(setup(json({ ...voice(), voice_id: "someone_else" })).client.getVoice(ID)),
    ).toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("treats a missing fetched voice as missing", async () => {
    await expect(setup(json({ detail: "private" }, 404)).client.getVoice(ID)).resolves.toBeNull();
  });

  it("confirms deletion and safely handles an already missing asset", async () => {
    const { client, fetchImpl } = setup(json({ status: "ok" }));
    await expect(client.deleteVoice(ID)).resolves.toEqual({ deleted: true, alreadyMissing: false });
    expect(fetchImpl.mock.calls[0]).toMatchObject([
      `https://api.elevenlabs.io/v1/voices/${ID}`,
      { method: "DELETE" },
    ]);
    await expect(setup(json({}, 404)).client.deleteVoice(ID)).resolves.toEqual({
      deleted: true,
      alreadyMissing: true,
    });
    expect(await failure(setup(json({ status: "pending" })).client.deleteVoice(ID))).toMatchObject({
      code: "INVALID_RESPONSE",
      providerMayHaveAccepted: true,
    });
  });

  it("only generates the fixed review script and returns bounded MP3 audio", async () => {
    const bytes = new Uint8Array([73, 68, 51, 4, 0, 0, 0]);
    const { client, fetchImpl } = setup(
      new Response(bytes, { headers: { "Content-Type": "audio/mpeg" } }),
    );
    await expect(client.renderFixedPreview(ID)).resolves.toEqual({
      bytes,
      contentType: "audio/mpeg",
      requestId: null,
      characterCost: null,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(
      `https://api.elevenlabs.io/v1/text-to-speech/${ID}?output_format=mp3_44100_128`,
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      text: ELEVENLABS_VOICE_PREVIEW.text,
      model_id: "eleven_flash_v2_5",
    });
    expect(init).toMatchObject({
      method: "POST",
      headers: { Accept: "audio/mpeg", "xi-api-key": KEY },
    });
  });

  it.each([
    new Response("not audio", { headers: { "Content-Type": "audio/mpeg" } }),
    json({ error: "not audio" }),
    new Response(new Uint8Array(), { headers: { "Content-Type": "audio/mpeg" } }),
    new Response(new Uint8Array([0xc9, 0xc4, 0xb3]), { headers: { "Content-Type": "audio/mpeg" } }),
  ])(
    "rejects malformed preview audio without refunding an ambiguous generation",
    async (response) => {
      expect(await failure(setup(response).client.renderFixedPreview(ID))).toMatchObject({
        code: "INVALID_RESPONSE",
        providerMayHaveAccepted: true,
      });
    },
  );

  it("accepts an MPEG frame in an octet-stream response", async () => {
    const bytes = new Uint8Array([0xff, 0xfb, 0x90, 0x44]);
    await expect(
      setup(
        new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } }),
      ).client.renderFixedPreview(ID),
    ).resolves.toEqual({ bytes, contentType: "audio/mpeg", requestId: null, characterCost: null });
  });

  it("retains documented generation correlation and character units without treating them as USD", async () => {
    const bytes = new Uint8Array([73, 68, 51, 4]);
    const response = new Response(bytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "request-id": "request-123:abc",
        "character-cost": "27",
      },
    });
    await expect(setup(response).client.renderFixedPreview(ID)).resolves.toEqual({
      bytes,
      contentType: "audio/mpeg",
      requestId: "request-123:abc",
      characterCost: 27,
    });
  });

  it.each(["-1", "NaN", "Infinity", "1.5", "9007199254740992", "0x20", "not-a-cost"])(
    "discards malformed character-cost %s",
    async (characterCost) => {
      const response = new Response(new Uint8Array([73, 68, 51]), {
        headers: {
          "Content-Type": "audio/mpeg",
          "request-id": "https://private.example/key",
          "character-cost": characterCost,
        },
      });
      expect(await setup(response).client.renderFixedPreview(ID)).toMatchObject({
        requestId: null,
        characterCost: null,
      });
    },
  );

  it("retains a legitimate zero character count", async () => {
    const response = new Response(new Uint8Array([73, 68, 51]), {
      headers: { "Content-Type": "audio/mpeg", "character-cost": "0" },
    });
    expect(await setup(response).client.renderFixedPreview(ID)).toMatchObject({
      requestId: null,
      characterCost: 0,
    });
  });

  it.each([null, undefined, "wrong type", []])(
    "sanitizes a malformed clone object before provider access",
    async (value) => {
      const { client, fetchImpl } = setup();
      expect(
        await failure(
          client.createInstantClone(
            value as unknown as Parameters<typeof client.createInstantClone>[0],
          ),
        ),
      ).toMatchObject({ code: "INVALID_INPUT", providerMayHaveAccepted: false });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it("allows vendor-documented extra default voices on page zero while bounding page size", async () => {
    const voices = [voice(), { ...voice(), voice_id: "default_1" }];
    const page = await setup(json({ voices, has_more: false })).client.listVoices({ pageSize: 1 });
    expect(page.voices).toHaveLength(2);
    expect(
      await failure(
        setup(
          json({ voices: Array.from({ length: 151 }, () => voice()), has_more: false }),
        ).client.listVoices({ pageSize: 100 }),
      ),
    ).toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each(["", " ", "private\u0000key", "private key", "ékey", "x".repeat(513)])(
    "rejects invalid credentials without leaking them",
    (apiKey) => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect(() => createElevenLabsVoiceClient({ apiKey, fetchImpl })).toThrow(
        "The voice request is invalid.",
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([0, 99, 120_001, NaN, 100.5])("rejects unsafe timeout %s", (timeoutMs) => {
    expect(() => createElevenLabsVoiceClient({ apiKey: KEY, timeoutMs })).toThrow(
      ElevenLabsVoiceError,
    );
  });

  it.each([
    "",
    "../another",
    "https://evil.example",
    "voice?id=x",
    "voice%2Fother",
    "x".repeat(129),
  ])("rejects invalid voice ID %s before any request", async (id) => {
    const { client, fetchImpl } = setup();
    for (const operation of [client.getVoice, client.deleteVoice, client.renderFixedPreview]) {
      expect(await failure(operation(id))).toMatchObject({
        code: "INVALID_INPUT",
        providerMayHaveAccepted: false,
      });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects unsupported, empty, oversized or excessive source audio before sending it", async () => {
    const { client, fetchImpl } = setup();
    const valid = clone();
    const invalid = [
      { ...valid, name: "\n" },
      { ...valid, name: "x".repeat(81) },
      { ...valid, description: "x".repeat(501) },
      { ...valid, samples: [] },
      { ...valid, samples: Array.from({ length: 4 }, () => valid.samples[0]) },
      { ...valid, samples: [{ bytes: new Uint8Array(32), mimeType: "text/plain" }] },
      { ...valid, samples: [{ bytes: new Uint8Array(31), mimeType: "audio/wav" }] },
      {
        ...valid,
        samples: [{ bytes: new Uint8Array(10 * 1_024 * 1_024 + 1), mimeType: "audio/wav" }],
      },
      {
        ...valid,
        samples: Array.from({ length: 2 }, () => ({
          bytes: new Uint8Array(8 * 1_024 * 1_024),
          mimeType: "audio/wav",
        })),
      },
    ];
    for (const item of invalid)
      expect(await failure(client.createInstantClone(item))).toMatchObject({
        code: "INVALID_INPUT",
        providerMayHaveAccepted: false,
      });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([0, 101, 2.2])(
    "rejects invalid page size %s before provider access",
    async (pageSize) => {
      const { client, fetchImpl } = setup();
      expect(await failure(client.listVoices({ pageSize }))).toMatchObject({
        code: "INVALID_INPUT",
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it.each([400, 401, 403, 404, 422])(
    "sanitizes definite provider rejection %s and does not retry",
    async (status) => {
      const { client, fetchImpl } = setup(
        json({ detail: { message: `secret ${KEY} source-audio` } }, status),
      );
      const error = await failure(client.createInstantClone(clone()));
      expect(error).toMatchObject({
        code: "PROVIDER_REJECTED",
        providerMayHaveAccepted: false,
        providerStatus: status,
      });
      expect(JSON.stringify(error)).not.toContain(KEY);
      expect(String(error)).not.toContain("source-audio");
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it.each([408, 409, 425, 429, 500, 503])(
    "retains uncertain provider outcome %s without retries",
    async (status) => {
      const { client, fetchImpl } = setup(json({ detail: "private detail" }, status));
      expect(await failure(client.createInstantClone(clone()))).toMatchObject({
        code: "PROVIDER_UNAVAILABLE",
        providerMayHaveAccepted: true,
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    },
  );

  it("sanitizes network errors and preserves uncertain mutation outcome", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockRejectedValue(new Error(`network ${KEY}`));
    const error = await failure(client.deleteVoice(ID));
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE", providerMayHaveAccepted: true });
    expect(String(error)).not.toContain(KEY);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects redirects even when a test transport returns them", async () => {
    const { client, fetchImpl } = setup(
      new Response(null, { status: 302, headers: { Location: "https://evil.example" } }),
    );
    expect(await failure(client.createInstantClone(clone()))).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
      providerMayHaveAccepted: true,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("error");
  });

  it("rejects oversized declared JSON before reading it", async () => {
    const { client } = setup(
      new Response("{}", { headers: { "Content-Length": String(256 * 1_024 + 1) } }),
    );
    expect(await failure(client.listVoices())).toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("bounds streamed JSON and preview bytes even without Content-Length", async () => {
    const excessive = new Uint8Array(2 * 1_024 * 1_024 + 1).fill(73);
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(excessive);
          controller.close();
        },
      });
    expect(await failure(setup(new Response(stream())).client.listVoices())).toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(
      await failure(
        setup(
          new Response(stream(), { headers: { "Content-Type": "audio/mpeg" } }),
        ).client.renderFixedPreview(ID),
      ),
    ).toMatchObject({ code: "INVALID_RESPONSE", providerMayHaveAccepted: true });
  });

  it("sanitizes malformed JSON and keeps accepted creation uncertain", async () => {
    expect(
      await failure(setup(new Response(`malformed ${KEY}`)).client.createInstantClone(clone())),
    ).toMatchObject({ code: "INVALID_RESPONSE", providerMayHaveAccepted: true });
  });

  it("does not contact the provider for an already aborted request", async () => {
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    controller.abort(new Error(`private ${KEY}`));
    expect(
      await failure(client.createInstantClone(clone(), { signal: controller.signal })),
    ).toMatchObject({ code: "ABORTED", providerMayHaveAccepted: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("honors caller cancellation even if the transport has not returned", async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockImplementation(() => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = failure(client.createInstantClone(clone(), { signal: controller.signal }));
    controller.abort();
    expect(await pending).toMatchObject({ code: "ABORTED", providerMayHaveAccepted: true });
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("times out both the initial request and stalled response bodies", async () => {
    vi.useFakeTimers();
    const first = setup();
    first.fetchImpl.mockImplementation(() => new Promise(() => undefined));
    const initial = failure(first.client.getVoice(ID));
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await initial).toMatchObject({ code: "ABORTED", providerMayHaveAccepted: false });
    const stalled = new ReadableStream<Uint8Array>({
      start() {
        /* Remain open without bytes. */
      },
    });
    const second = setup(new Response(stalled, { headers: { "Content-Type": "audio/mpeg" } }));
    const body = failure(second.client.renderFixedPreview(ID));
    await vi.advanceTimersByTimeAsync(1_001);
    expect(await body).toMatchObject({ code: "ABORTED", providerMayHaveAccepted: true });
    expect(second.fetchImpl).toHaveBeenCalledOnce();
  });
});
