import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  OpenAISipTurnTiming,
  XAI_TURN_AUDIO_START_EVENTS,
} from "../src/lib/voice/openai-sip-turn-timing";

describe("OpenAI SIP turn timing", () => {
  it("measures xAI turns from the first audio chunk, which is all xAI emits", () => {
    const timing = new OpenAISipTurnTiming({ audioStartEvents: XAI_TURN_AUDIO_START_EVENTS });
    // The forced opening plays before any caller turn and must not count.
    timing.observe({ type: "response.created", response: { id: "opening" } }, 500);
    timing.observe({ type: "response.output_audio.delta", response_id: "opening" }, 900);
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_1" }, 1_000);
    timing.observe({ type: "input_audio_buffer.committed", item_id: "item_1" }, 1_010);
    timing.observe({ type: "response.created", response: { id: "response_1" } }, 1_070);
    // A late chunk from the opening cannot satisfy the caller's turn.
    timing.observe({ type: "response.output_audio.delta", response_id: "opening" }, 1_200);
    timing.observe({ type: "response.output_audio.delta", response_id: "response_1" }, 1_420);
    timing.observe({ type: "response.output_audio.delta", response_id: "response_1" }, 1_460);

    expect(timing.summary()).toMatchObject({
      turnsObserved: 1,
      turnsWithAudio: 1,
      stoppedToResponseP50Ms: 70,
      stoppedToAudioP50Ms: 420,
    });
  });

  it("accepts an xAI audio chunk without a response id only once the turn has a response", () => {
    const timing = new OpenAISipTurnTiming({ audioStartEvents: XAI_TURN_AUDIO_START_EVENTS });
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_1" }, 1_000);
    timing.observe({ type: "response.output_audio.delta" }, 1_050);
    timing.observe({ type: "response.created", response: { id: "response_1" } }, 1_100);
    timing.observe({ type: "response.output_audio.delta" }, 1_300);

    expect(timing.summary()).toMatchObject({ turnsWithAudio: 1, stoppedToAudioP50Ms: 300 });
  });

  it("keeps OpenAI's explicit playback event as the default audio signal", () => {
    const timing = new OpenAISipTurnTiming();
    timing.observe({ type: "input_audio_buffer.speech_stopped", item_id: "item_1" }, 1_000);
    timing.observe({ type: "response.created", response: { id: "response_1" } }, 1_100);
    timing.observe({ type: "response.output_audio.delta", response_id: "response_1" }, 1_150);
    expect(timing.summary().turnsWithAudio).toBe(0);
    timing.observe({ type: "output_audio_buffer.started", response_id: "response_1" }, 1_200);
    expect(timing.summary()).toMatchObject({ turnsWithAudio: 1, stoppedToAudioP50Ms: 200 });
  });

  it("gives xAI calls the xAI audio events in the live session", () => {
    const session = readFileSync(
      resolve(process.cwd(), "src/lib/voice/openai-sip-session.ts"),
      "utf8",
    );
    expect(session).toContain(
      'provider === "xai" ? { audioStartEvents: XAI_TURN_AUDIO_START_EVENTS } : {}',
    );
  });

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
