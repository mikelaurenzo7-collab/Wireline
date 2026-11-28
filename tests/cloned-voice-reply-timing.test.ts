import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  ElevenLabsMediaSession,
  type SpeechStream,
} from "../src/lib/voice/elevenlabs-media-session";
import { addSample, percentile } from "../src/lib/voice/openai-sip-turn-timing";

/**
 * On 2026-11-27 the first customer call on a cloned voice answered a median
 * 1.35 seconds after the caller stopped speaking; built-in voices answer in
 * about 0.4. The only number kept was that total. These pin the breakdown the
 * call now records, so the slow step can be named before anything is changed.
 */
class Peer extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close");
  }
  terminate() {
    this.close();
  }
  ping() {
    this.emit("pong");
  }
  receive(value: Record<string, unknown>) {
    this.emit("message", Buffer.from(JSON.stringify(value)));
  }
}

const audio: SpeechStream = async function* () {
  yield new Uint8Array([255]);
};

function session(onFirstClause: (sinceResponseMs: number, characters: number) => void) {
  const carrier = new Peer();
  const model = new Peer();
  const media = new ElevenLabsMediaSession({
    carrier,
    model,
    streamSid: "MZtiming",
    cloneSpeech: audio,
    stockSpeech: audio,
    onClonePlayed: async () => {},
    onFallback: () => {},
    onFirstClause,
    markTimeoutMs: 1000,
  });
  model.emit("open");
  model.receive({ type: "session.updated" });
  const say = (responseId: string, ...deltas: string[]) => {
    model.receive({ type: "response.created", response: { id: responseId } });
    for (const delta of deltas) {
      model.receive({
        type: "response.output_text.delta",
        response_id: responseId,
        item_id: `item-${responseId}`,
        delta,
      });
    }
  };
  return { media, say };
}

describe("a cloned-voice reply's first clause", () => {
  it("is timed once per reply, from the model starting to its first speakable clause", () => {
    const seen = vi.fn();
    const { say } = session(seen);
    say("r1", "We open ", "at nine. ", "Would you like ", "to book? ");
    expect(seen).toHaveBeenCalledOnce();
    const [sinceResponseMs, characters] = seen.mock.calls[0];
    expect(sinceResponseMs).toBeGreaterThanOrEqual(0);
    expect(sinceResponseMs).toBeLessThan(1000);
    // "We open at nine." is the clause sent to be spoken first.
    expect(characters).toBe("We open at nine.".length);

    say("r2", "Yes, ", "we do. ");
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("is not timed for the opening, which no model reply produces", () => {
    const seen = vi.fn();
    const { media } = session(seen);
    media.playOpening("Hi, I'm Bo, an AI assistant with Ridge Dental.");
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("the timing samples", () => {
  it("keeps whole milliseconds and ignores values that are not a duration", () => {
    const samples: number[] = [];
    for (const value of [120.4, 80.6, Number.NaN, -5, 300]) addSample(samples, value);
    expect(samples).toEqual([120, 81, 300]);
    expect(percentile(samples, 0.5)).toBe(120);
    expect(percentile(samples, 0.95)).toBe(300);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("the cloned-voice bridge", () => {
  const bridge = readFileSync(
    resolve(process.cwd(), "src/lib/voice/elevenlabs-media-bridge.ts"),
    "utf8",
  );

  it("times the voice check, the spend reservation and the speech engine separately", () => {
    expect(bridge).toContain("addSample(timing.voiceCheckMs, spendStarted - checkStarted);");
    expect(bridge).toContain("addSample(timing.spendMs, performance.now() - spendStarted);");
    expect(bridge).toContain("addSample(timing.speechFirstByteMs, performance.now() - started);");
    expect(bridge).toContain("cloneSpeech: timed(speech.cloneSpeech),");
  });

  it("logs the breakdown once, when the call ends", () => {
    expect(bridge).toContain('session.once("close", () => {');
    expect(bridge).toContain('log.info("Cloned phone voice reply timing", {');
    for (const field of [
      "firstClauseP50Ms",
      "voiceCheckP50Ms",
      "spendP50Ms",
      "speechFirstByteP50Ms",
      "speechFirstByteP95Ms",
    ]) {
      expect(bridge).toContain(`${field}:`);
    }
  });

  // The order is a spend control: no speech is requested before its cost is
  // reserved. Timing must not have moved it.
  it("still reserves spend before speech is requested", () => {
    const speech = readFileSync(
      resolve(process.cwd(), "src/lib/voice/cloned-speech-stream.ts"),
      "utf8",
    );
    expect(speech.indexOf("await input.reserve(provider, text);")).toBeGreaterThan(-1);
    expect(speech.indexOf("await input.reserve(provider, text);")).toBeLessThan(
      speech.indexOf("https://api.elevenlabs.io/v1/text-to-speech/"),
    );
  });
});
