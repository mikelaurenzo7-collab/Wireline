import { describe, expect, it } from "vitest";
import { OpenAISipTurnTiming } from "../src/lib/voice/openai-sip-turn-timing";

describe("OpenAI SIP turn timing", () => {
  it("measures a caller turn from VAD stop to the matching response audio", () => {
    const timing = new OpenAISipTurnTiming();
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_1" }, 1_000);
    timing.observe({ type: "input_audio_buffer.committed", item_id: "item_1" }, 1_010);
    timing.observe({ type: "response.created", response: { id: "response_1" } }, 1_100);
    timing.observe({ type: "output_audio_buffer.started", response_id: "opening" }, 1_150);
    timing.observe({ type: "output_audio_buffer.started", response_id: "response_1" }, 1_200);

    expect(timing.summary()).toMatchObject({
      turnsObserved: 1,
      turnsWithAudio: 1,
      stoppedToResponseP50Ms: 100,
      stoppedToAudioP50Ms: 200,
    });
  });

  it("keeps the caller turn open across a tool-only response and its continuation", () => {
    const timing = new OpenAISipTurnTiming();
    timing.observe({ type: "input_audio_buffer.committed", item_id: "item_2" }, 2_000);
    timing.observe({ type: "response.created", response: { id: "tool_response" } }, 2_070);
    timing.observeToolConfirmation(230, false);
    timing.observe({ type: "response.created", response: { id: "continuation" } }, 2_350);
    timing.observe({ type: "output_audio_buffer.started", response_id: "continuation" }, 2_510);

    expect(timing.summary()).toMatchObject({
      turnsObserved: 1,
      turnsWithAudio: 1,
      stoppedToResponseP50Ms: 70,
      stoppedToAudioP50Ms: 510,
      toolConfirmations: 1,
      toolConfirmationP50Ms: 230,
    });
  });

  it("does not count unrelated or incomplete output as a completed caller response", () => {
    const timing = new OpenAISipTurnTiming();
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_3" }, 3_000);
    timing.observe({ type: "output_audio_buffer.started", response_id: "opening" }, 3_100);
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_4" }, 3_200);
    timing.observeToolConfirmation(20_000, true);

    expect(timing.summary()).toMatchObject({
      turnsObserved: 2,
      turnsWithAudio: 0,
      stoppedToAudioP50Ms: null,
      toolConfirmations: 1,
      toolTimeouts: 1,
      toolConfirmationP95Ms: 20_000,
    });
  });
});
