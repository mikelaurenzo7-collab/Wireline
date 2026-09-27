import { POSTGRES_INT32_MAX } from "../ai-usage";
import { OPENAI_REALTIME_PRICING_MODEL } from "./openai-realtime-pricing";

export type RealtimeProviderUsage = {
  key: string;
  kind: "response" | "transcription";
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  details: Record<string, number>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function count(value: unknown, fallback?: number): number | null {
  if (value === undefined && fallback !== undefined) return fallback;
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= POSTGRES_INT32_MAX
    ? value
    : null;
}
function providerId(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : null;
}
const usd = (millionths: number) => Math.round(millionths) / 1_000_000;

/**
 * Only call with events received on the authenticated server sideband socket.
 * No client-reported usage or transcript contents are accepted or persisted.
 * Rates verified against official model/pricing pages on 2026-09-27:
 * https://developers.openai.com/api/docs/models/gpt-realtime-2.1
 * https://developers.openai.com/api/docs/pricing
 * Input transcription is separately billed, outside response.done usage.
 */
export function parseRealtimeProviderUsage(
  event: Record<string, unknown>,
  transcriptionModel: string,
): RealtimeProviderUsage | null {
  if (event.type === "response.done") {
    const response = record(event.response);
    const id = providerId(response.id);
    if (!id || (response.model && response.model !== OPENAI_REALTIME_PRICING_MODEL)) return null;
    const usage = record(response.usage);
    const input = count(usage.input_tokens);
    const output = count(usage.output_tokens);
    const detail = record(usage.input_token_details);
    const outputDetail = record(usage.output_token_details);
    const cachedDetail = record(detail.cached_tokens_details);
    const audio = count(detail.audio_tokens);
    const image = count(detail.image_tokens, 0);
    const text = count(detail.text_tokens);
    const audioOutput = count(outputDetail.audio_tokens);
    const textOutput = count(outputDetail.text_tokens);
    const cached = count(detail.cached_tokens, 0);
    const cachedAudio = count(cachedDetail.audio_tokens, 0);
    const cachedImage = count(cachedDetail.image_tokens, 0);
    const cachedText = count(cachedDetail.text_tokens, 0);
    if (
      input === null ||
      output === null ||
      audio === null ||
      image === null ||
      text === null ||
      audioOutput === null ||
      textOutput === null ||
      cached === null ||
      cachedAudio === null ||
      cachedImage === null ||
      cachedText === null ||
      audio + image + text > input ||
      audioOutput + textOutput > output ||
      cachedAudio > audio ||
      cachedImage > image ||
      cachedText > text ||
      cachedAudio + cachedImage + cachedText !== cached
    )
      return null;
    // Special/reasoning tokens not allocated to audio/image retain text pricing.
    const uncachedText = input - audio - image - cachedText;
    return {
      key: `response:${id}`,
      kind: "response",
      model: OPENAI_REALTIME_PRICING_MODEL,
      inputTokens: input - cached,
      outputTokens: output,
      cacheReadTokens: cached,
      costUsd: usd(
        uncachedText * 4 +
          (audio - cachedAudio) * 32 +
          (image - cachedImage) * 5 +
          cachedText * 0.4 +
          cachedAudio * 0.4 +
          cachedImage * 0.5 +
          (output - audioOutput) * 24 +
          audioOutput * 64,
      ),
      details: {
        input_text: input - audio - image,
        input_audio: audio,
        input_image: image,
        cached_text: cachedText,
        cached_audio: cachedAudio,
        cached_image: cachedImage,
        output_text: output - audioOutput,
        output_audio: audioOutput,
      },
    };
  }
  if (event.type !== "conversation.item.input_audio_transcription.completed") return null;
  const id = providerId(event.item_id);
  const index = count(event.content_index, 0);
  const usage = record(event.usage);
  const input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  if (!id || index === null || usage.type !== "tokens" || input === null || output === null)
    return null;
  const model = /^(gpt-4o-mini-transcribe|gpt-4o-transcribe)(?:-\d{4}-\d{2}-\d{2})?$/.exec(
    transcriptionModel,
  );
  // Unknown/duration-priced transcription models keep the existing reserve;
  // never silently apply a different model's rate to them.
  if (!model) return null;
  const mini = model[1] === "gpt-4o-mini-transcribe";
  return {
    key: `transcription:${id}:${index}`,
    kind: "transcription",
    model: transcriptionModel,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: 0,
    costUsd: usd(input * (mini ? 1.25 : 2.5) + output * (mini ? 5 : 10)),
    details: { input_tokens: input, output_tokens: output },
  };
}
