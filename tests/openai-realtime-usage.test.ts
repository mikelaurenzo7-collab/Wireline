import { describe, expect, it } from "vitest";
import { parseRealtimeProviderUsage } from "../src/lib/voice/openai-realtime-usage";

const response = () => ({
  type: "response.done",
  response: {
    id: "resp_123",
    usage: {
      input_tokens: 1200,
      output_tokens: 120,
      input_token_details: {
        text_tokens: 1000,
        audio_tokens: 200,
        image_tokens: 0,
        cached_tokens: 600,
        cached_tokens_details: { text_tokens: 500, audio_tokens: 100, image_tokens: 0 },
      },
      output_token_details: { text_tokens: 20, audio_tokens: 100 },
    },
  },
});

describe("server Realtime usage pricing", () => {
  it("prices audio/text/cache separately without counting cached input twice", () => {
    expect(parseRealtimeProviderUsage(response(), "gpt-4o-mini-transcribe")).toMatchObject({
      key: "response:resp_123",
      inputTokens: 600,
      outputTokens: 120,
      cacheReadTokens: 600,
      costUsd: 0.01232,
    });
  });
  it("includes separately billed transcription using item/content identity", () => {
    expect(
      parseRealtimeProviderUsage(
        {
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "item_123",
          content_index: 2,
          transcript: "private content not retained",
          usage: { type: "tokens", input_tokens: 80, output_tokens: 20 },
        },
        "gpt-4o-mini-transcribe",
      ),
    ).toEqual({
      key: "transcription:item_123:2",
      kind: "transcription",
      model: "gpt-4o-mini-transcribe",
      inputTokens: 80,
      outputTokens: 20,
      cacheReadTokens: 0,
      costUsd: 0.0002,
      details: { input_tokens: 80, output_tokens: 20 },
    });
  });
  it("counts failed or cancelled response usage because generation can be billable", () => {
    expect(
      parseRealtimeProviderUsage(
        { ...response(), response: { ...response().response, status: "failed" } },
        "",
      ),
    ).toMatchObject({ costUsd: 0.01232 });
  });
  it.each([NaN, Infinity, -1, "1200", 1.5])("rejects malformed input count %s", (value) => {
    const event = response();
    (event.response.usage as Record<string, unknown>).input_tokens = value;
    expect(parseRealtimeProviderUsage(event, "")).toBeNull();
  });
  it("rejects inconsistent cache counts and missing audio modality details", () => {
    const event = response();
    event.response.usage.input_token_details.cached_tokens = 9999;
    expect(parseRealtimeProviderUsage(event, "")).toBeNull();
    expect(
      parseRealtimeProviderUsage(
        {
          type: "response.done",
          response: { id: "resp_1", usage: { input_tokens: 100, output_tokens: 20 } },
        },
        "",
      ),
    ).toBeNull();
  });
  it("does not invent transcription prices for an unsupported model", () => {
    expect(
      parseRealtimeProviderUsage(
        {
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "item_1",
          usage: { type: "tokens", input_tokens: 80, output_tokens: 20 },
        },
        "future-transcriber",
      ),
    ).toBeNull();
  });
});
