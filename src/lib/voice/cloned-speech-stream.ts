import type { SpeechStream } from "./elevenlabs-media-session";
import { ELEVENLABS_SPEECH_MODEL, ELEVENLABS_SPEECH_SETTINGS } from "./elevenlabs-speech-settings";

export const clonedStockVoice = (gender: "female" | "male" | null): "nova" | "onyx" =>
  gender === "male" ? "onyx" : "nova";

/** Browser A/B preview uses precisely the stock fallback voice used on calls. */
export async function renderClonedStockPreview(input: {
  text: string;
  gender: "female" | "male" | null;
  apiKey: string;
}): Promise<Buffer> {
  if (!input.apiKey.trim()) throw new Error("Stock preview is not configured");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: clonedStockVoice(input.gender),
      input: input.text,
      response_format: "mp3",
    }),
  });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for await (const chunk of responseBytes(response)) {
    bytes += chunk.length;
    if (bytes > 2_000_000) throw new Error("Stock preview exceeded its limit");
    chunks.push(chunk);
  }
  if (!bytes) throw new Error("Stock preview was empty");
  return Buffer.concat(chunks);
}

/** PCM16 24 kHz -> G.711 mu-law 8 kHz. Carries split samples across HTTP chunks. */
export async function* pcm24ToMulaw(source: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  let pending = Buffer.alloc(0);
  for await (const chunk of source) {
    const bytes = Buffer.concat([pending, chunk]);
    const length = bytes.length - (bytes.length % 6);
    const out = Buffer.alloc(length / 6);
    for (let offset = 0; offset < length; offset += 6) {
      // Low-pass average before decimation; telephone bandwidth is intentionally bounded.
      let sample = Math.round(
        (bytes.readInt16LE(offset) +
          bytes.readInt16LE(offset + 2) +
          bytes.readInt16LE(offset + 4)) /
          3,
      );
      const sign = sample < 0 ? 0x80 : 0;
      sample = Math.min(32635, Math.abs(sample)) + 132;
      let exponent = 7;
      for (let mask = 0x4000; exponent > 0 && !(sample & mask); mask >>= 1) exponent -= 1;
      out[offset / 6] = ~(sign | (exponent << 4) | ((sample >> (exponent + 3)) & 15)) & 255;
    }
    pending = bytes.subarray(length);
    if (out.length) yield out;
  }
}

async function* responseBytes(response: Response): AsyncIterable<Uint8Array> {
  if (!response.ok || !response.body) throw new Error(`Speech provider HTTP ${response.status}`);
  const reader = response.body.getReader();
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      yield next.value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export function clonedSpeechStreams(input: {
  voiceId: string;
  elevenLabsKey: string;
  openAIKey: string;
  stockVoice: string;
  fetchImpl?: typeof fetch;
  /** Reserve provider cost before each synthesis attempt; errors fail closed. */
  reserve: (provider: "elevenlabs" | "openai", text: string) => Promise<void>;
}): { cloneSpeech: SpeechStream; stockSpeech: SpeechStream } {
  const request = input.fetchImpl ?? fetch;
  // Keep audio continuity within this call and utterance. Text context alone
  // cannot carry the preceding generation's actual cadence or voice delivery.
  let completedSpeech = { text: "", requestIds: [] as string[] };
  const stream = (provider: "elevenlabs" | "openai"): SpeechStream =>
    async function* (text, signal, context) {
      if (signal.aborted) return;
      await input.reserve(provider, text);
      if (signal.aborted) return;
      const deadline = AbortSignal.timeout(15_000);
      const firstByte = new AbortController();
      const firstByteTimer = setTimeout(() => firstByte.abort(), 4_000);
      const combined = AbortSignal.any([signal, deadline, firstByte.signal]);
      const previousText = context?.previousText ?? "";
      if (provider === "elevenlabs" && !previousText)
        completedSpeech = { text: "", requestIds: [] };
      const previousRequestIds =
        provider === "elevenlabs" && previousText && completedSpeech.text === previousText
          ? completedSpeech.requestIds
          : [];
      try {
        const response =
          provider === "elevenlabs"
            ? await request(
                `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/stream?output_format=ulaw_8000`,
                {
                  method: "POST",
                  signal: combined,
                  headers: {
                    "xi-api-key": input.elevenLabsKey,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    text,
                    model_id: ELEVENLABS_SPEECH_MODEL,
                    voice_settings: ELEVENLABS_SPEECH_SETTINGS,
                    ...(previousRequestIds.length
                      ? { previous_request_ids: previousRequestIds }
                      : previousText
                        ? { previous_text: previousText }
                        : {}),
                  }),
                },
              )
            : await request("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                signal: combined,
                headers: {
                  Authorization: `Bearer ${input.openAIKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: "tts-1",
                  voice: input.stockVoice,
                  input: text,
                  response_format: "pcm",
                }),
              });
        const bytes =
          provider === "openai" ? pcm24ToMulaw(responseBytes(response)) : responseBytes(response);
        let receivedBytes = 0;
        for await (const chunk of bytes) {
          if (chunk.length) clearTimeout(firstByteTimer);
          receivedBytes += chunk.length;
          yield chunk;
        }
        // Stitch only fully consumed, successful generations. An interrupted
        // or failed response must never become the next utterance's reference.
        const requestId = response.headers.get("request-id");
        if (provider === "elevenlabs" && !signal.aborted && receivedBytes && requestId) {
          completedSpeech = {
            text: (previousText + " " + text).trim().slice(-1_000),
            requestIds: [...previousRequestIds, requestId].slice(-3),
          };
        }
      } finally {
        clearTimeout(firstByteTimer);
      }
    };
  return { cloneSpeech: stream("elevenlabs"), stockSpeech: stream("openai") };
}
