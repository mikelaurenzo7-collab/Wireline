import { EventEmitter } from "node:events";
import { describe, it, expect } from "vitest";
import {
  ElevenLabsMediaSession,
  type SpeechStream,
} from "../src/lib/voice/elevenlabs-media-session";
import { pcm24ToMulaw, clonedSpeechStreams } from "../src/lib/voice/cloned-speech-stream";

class Peer extends EventEmitter {
  readyState = 1;
  bufferedAmount = 0;
  sent: Record<string, any>[] = [];
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
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const audio: SpeechStream = async function* () {
  yield new Uint8Array([255, 255, 255]);
};
function setup(cloneSpeech: SpeechStream = audio, markTimeoutMs = 1000, initialStock = false) {
  const carrier = new Peer(),
    model = new Peer();
  let played = 0,
    fallback = 0;
  const session = new ElevenLabsMediaSession({
    carrier,
    model,
    streamSid: "MZtest",
    cloneSpeech,
    stockSpeech: audio,
    onClonePlayed: async () => {
      played++;
    },
    onFallback: () => {
      fallback++;
    },
    markTimeoutMs,
    initialStock,
  });
  const events: Record<string, any>[] = [];
  session.on("message", (value) => events.push(JSON.parse(String(value))));
  model.emit("open");
  model.receive({ type: "session.updated" });
  const speak = (text = "Hello there.", responseId = "r1") => {
    model.receive({ type: "response.created", response: { id: responseId } });
    model.receive({
      type: "response.output_text.delta",
      response_id: responseId,
      item_id: "item1",
      delta: text,
    });
    model.receive({ type: "response.output_text.done", response_id: responseId });
    model.receive({
      type: "response.done",
      response: { id: responseId, status: "completed", usage: { total_tokens: 5 } },
    });
  };
  const acknowledge = () => {
    const mark = carrier.sent.findLast((e) => e.event === "mark");
    expect(mark).toBeDefined();
    carrier.receive({ event: "mark", streamSid: "MZtest", mark: mark!.mark });
  };
  return {
    carrier,
    model,
    session,
    events,
    speak,
    acknowledge,
    played: () => played,
    fallback: () => fallback,
  };
}

describe("cloned phone media", () => {
  it("prepares only one clause ahead while preserving carrier playback order", async () => {
    const requested: string[] = [];
    const previous: string[] = [];
    const s = setup(async function* (text, _signal, context) {
      requested.push(text);
      previous.push(context?.previousText ?? "");
      yield new Uint8Array([requested.length]);
    });
    s.speak("First sentence. Second sentence. Third sentence.");
    await tick();
    expect(requested).toEqual(["First sentence.", "Second sentence."]);
    expect(s.carrier.sent.filter((e) => e.event === "media")).toHaveLength(1);
    expect(s.played()).toBe(0);
    s.acknowledge();
    await tick();
    expect(requested).toHaveLength(3);
    expect(s.carrier.sent.filter((e) => e.event === "media")).toHaveLength(2);
    s.acknowledge();
    await tick();
    s.acknowledge();
    await tick();
    expect(previous).toEqual(["", "First sentence.", "First sentence. Second sentence."]);
    expect(s.played()).toBe(3);
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(1);
    s.session.close();
  });

  it("discards prepared audio after interruption and resets continuity for the next turn", async () => {
    const requested: Array<{ text: string; previous: string }> = [];
    const s = setup(async function* (text, _signal, context) {
      requested.push({ text, previous: context?.previousText ?? "" });
      yield new Uint8Array([1]);
    });
    s.speak("First sentence. Do not play this.");
    await tick();
    expect(requested).toHaveLength(2);
    s.model.receive({ type: "input_audio_buffer.speech_started" });
    s.acknowledge();
    await tick();
    expect(s.carrier.sent.filter((e) => e.event === "media")).toHaveLength(1);
    expect(s.played()).toBe(0);
    s.speak("New reply.", "r2");
    await tick();
    expect(requested.at(-1)).toEqual({ text: "New reply.", previous: "" });
    s.acknowledge();
    await tick();
    s.session.close();
  });

  it("falls back once when a prefetched clause fails without replaying the preceding clause", async () => {
    const requested: string[] = [];
    const s = setup(async function* (text) {
      requested.push(text);
      if (text === "Second sentence.") throw new Error("provider unavailable");
      yield new Uint8Array([1]);
    });
    s.speak("First sentence. Second sentence. Third sentence.");
    await tick();
    expect(s.fallback()).toBe(0);
    s.acknowledge();
    await tick();
    expect(s.fallback()).toBe(1);
    expect(s.played()).toBe(1);
    s.acknowledge();
    await tick();
    s.acknowledge();
    await tick();
    expect(requested).toEqual(["First sentence.", "Second sentence."]);
    expect(
      s.events
        .filter((e) => e.type === "response.output_audio_transcript.delta")
        .map((e) => e.delta),
    ).toEqual(["First sentence. ", "Second sentence. ", "Third sentence. "]);
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(1);
    s.session.close();
  });

  it("does not split decimal prices, URLs or titles at token boundaries", async () => {
    const clauses: string[] = [];
    const s = setup(async function* (text) {
      clauses.push(text);
      yield new Uint8Array([1]);
    });
    s.model.receive({ type: "response.created", response: { id: "r1" } });
    for (const delta of ["Dr.", " Smith pays $19.", "50 at https:", "//botbound.", "app."]) {
      s.model.receive({ type: "response.output_text.delta", response_id: "r1", delta });
    }
    await tick();
    expect(clauses).toEqual([]);
    s.model.receive({ type: "response.output_text.done", response_id: "r1" });
    s.model.receive({ type: "response.done", response: { id: "r1", status: "completed" } });
    await tick();
    expect(clauses).toEqual(["Dr. Smith pays $19.50 at https://botbound.app."]);
    s.acknowledge();
    await tick();
    s.session.close();
  });

  it("does not clear the phone buffer when a caller speaks into an idle session", () => {
    const s = setup();
    s.model.receive({ type: "input_audio_buffer.speech_started" });
    expect(s.carrier.sent).toEqual([]);
    expect(s.events.some((e) => e.type === "output_audio_buffer.cleared")).toBe(false);
    s.session.close();
  });
  it.each(["x".repeat(600), `${"x".repeat(600)}.`])(
    "bounds unbroken text and distant punctuation into a few synthesis calls",
    async (text) => {
      const clauses: string[] = [];
      const s = setup(async function* (clause) {
        clauses.push(clause);
        yield new Uint8Array([255]);
      });
      s.speak(text);
      for (let i = 0; i < 3; i++) {
        await tick();
        s.acknowledge();
      }
      await tick();
      expect(clauses).toHaveLength(3);
      expect(clauses.every((clause) => clause.length <= 240)).toBe(true);
      expect(clauses.join("")).toBe(text);
      expect(s.played()).toBe(3);
      s.session.close();
    },
  );
  it("uses stock speech when the clone was revoked between routing and admission", async () => {
    let cloneRequests = 0;
    const clone: SpeechStream = async function* () {
      cloneRequests++;
      yield new Uint8Array([1]);
    };
    const s = setup(clone, 1000, true);
    s.speak();
    await tick();
    s.acknowledge();
    await tick();
    expect(cloneRequests).toBe(0);
    expect(s.fallback()).toBe(1);
    expect(s.played()).toBe(0);
    expect(s.events.find((e) => e.type === "botbound.voice_fallback")?.reason).toBe(
      "clone_unavailable",
    );
    expect(s.events.some((e) => e.type === "response.done")).toBe(true);
    s.session.close();
  });
  it("requires real carrier playback before confirming disclosure/transcript and releasing response completion", async () => {
    const s = setup();
    s.speak();
    await tick();
    expect(s.carrier.sent.some((e) => e.event === "media")).toBe(true);
    expect(s.events.some((e) => e.type === "response.done")).toBe(false);
    expect(s.played()).toBe(0);
    s.acknowledge();
    await tick();
    expect(s.events.find((e) => e.type === "response.done")?.response.usage.total_tokens).toBe(5);
    expect(s.events.find((e) => e.type === "response.output_audio_transcript.delta")?.delta).toBe(
      "Hello there. ",
    );
    expect(s.played()).toBe(1);
    s.session.close();
  });
  it("does not mistake clear acknowledgements for played speech", async () => {
    const s = setup();
    s.speak();
    await tick();
    s.model.receive({ type: "input_audio_buffer.speech_started" });
    s.acknowledge();
    await tick();
    expect(s.played()).toBe(0);
    expect(s.events.some((e) => e.type === "response.output_audio_transcript.delta")).toBe(false);
    expect(s.carrier.sent.at(-1)?.event).toBe("clear");
    expect(s.model.sent.some((e) => e.type === "conversation.item.delete")).toBe(true);
    s.session.close();
  });
  it("retains completion and usage when the caller interrupts after model completion", async () => {
    const s = setup();
    s.speak();
    await tick();
    s.model.receive({ type: "input_audio_buffer.speech_started" });
    await tick();
    expect(s.events.filter((e) => e.type === "response.done")).toEqual([
      {
        type: "response.done",
        response: { id: "r1", status: "completed", usage: { total_tokens: 5 } },
      },
    ]);
    s.acknowledge();
    await tick();
    expect(s.played()).toBe(0);
    expect(s.events.some((e) => e.type === "response.output_audio_transcript.delta")).toBe(false);

    s.model.receive({ type: "input_audio_buffer.speech_stopped" });
    s.speak("I can help with that.", "r2");
    await tick();
    s.acknowledge();
    await tick();
    const completed = s.events.filter((e) => e.type === "response.done");
    expect(completed.map((e) => e.response.id)).toEqual(["r1", "r2"]);
    expect(completed.reduce((sum, e) => sum + e.response.usage.total_tokens, 0)).toBe(10);
    s.session.close();
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(2);
  });
  it("settles completed model work when the caller hangs up before playback finishes", async () => {
    const s = setup();
    s.speak();
    await tick();
    s.carrier.close();
    await tick();
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(1);
    expect(s.events.find((e) => e.type === "response.done")?.response.usage.total_tokens).toBe(5);
    expect(s.played()).toBe(0);
    expect(s.session.readyState).toBe(3);
  });
  it("cancels in-flight synthesis and drops late chunks after interruption", async () => {
    let release!: () => void;
    const blocked: SpeechStream = async function* () {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      yield new Uint8Array([1]);
    };
    const s = setup(blocked);
    s.speak();
    await tick();
    s.model.receive({ type: "input_audio_buffer.speech_started" });
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(1);
    release();
    await tick();
    expect(s.carrier.sent.some((e) => e.event === "media")).toBe(false);
    s.session.close();
  });
  it("clears partial clone audio and recovers through stock speech without rerunning tools", async () => {
    const broken: SpeechStream = async function* () {
      yield new Uint8Array([1]);
      throw new Error("provider failed");
    };
    const s = setup(broken);
    s.speak();
    await tick();
    s.acknowledge();
    await tick();
    expect(s.fallback()).toBe(1);
    expect(s.played()).toBe(0);
    expect(s.carrier.sent.some((e) => e.event === "clear")).toBe(true);
    expect(s.events.some((e) => e.type === "botbound.voice_fallback")).toBe(true);
    expect(s.events.filter((e) => e.type === "response.done")).toHaveLength(1);
    s.session.close();
  });
  it("closes rather than claiming playback when the carrier never acknowledges", async () => {
    const s = setup(audio, 5);
    s.speak();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(s.session.readyState).toBe(3);
    expect(s.played()).toBe(0);
  });
  it("configures text-only reasoning and mu-law input, retaining tools and instructions", () => {
    const s = setup();
    s.session.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: "Help",
          tools: [{ name: "test" }],
          audio: {
            output: { voice: "marin" },
            input: { transcription: { model: "gpt-4o-mini-transcribe" } },
          },
        },
      }),
    );
    expect(s.model.sent.at(-1)?.session).toMatchObject({
      output_modalities: ["text"],
      instructions: "Help",
      tools: [{ name: "test" }],
      audio: { input: { format: { type: "audio/pcmu" } } },
    });
    expect(s.model.sent.at(-1)?.session.audio.output).toBeUndefined();
    s.session.close();
  });
  it("passes caller audio and function-call events unchanged without leaking model audio", () => {
    const s = setup();
    s.carrier.receive({
      event: "media",
      streamSid: "MZtest",
      media: { track: "inbound", payload: "//8=" },
    });
    expect(s.model.sent.at(-1)).toEqual({
      type: "input_audio_buffer.append",
      audio: "//8=",
    });
    s.model.receive({
      type: "response.function_call_arguments.done",
      name: "book",
      call_id: "tool1",
      arguments: "{}",
    });
    expect(s.events.at(-1)?.name).toBe("book");
    s.model.receive({
      type: "response.output_audio.delta",
      delta: "forbidden",
    });
    expect(s.carrier.sent).toHaveLength(0);
    s.session.close();
  });
  it("shuts both providers down on caller disconnect", () => {
    const s = setup();
    s.carrier.close();
    expect(s.model.readyState).toBe(3);
    expect(s.session.readyState).toBe(3);
  });
  it("refuses cross-stream frames", () => {
    const s = setup();
    s.carrier.receive({
      event: "media",
      streamSid: "other",
      media: { track: "inbound", payload: "//8=" },
    });
    expect(s.session.readyState).toBe(3);
    expect(s.model.sent).toHaveLength(0);
  });
});

describe("speech provider transport", () => {
  it("converts PCM split across arbitrary HTTP boundaries without dropping samples", async () => {
    async function* whole() {
      yield Buffer.alloc(24);
    }
    async function* split() {
      yield Buffer.alloc(1);
      yield Buffer.alloc(8);
      yield Buffer.alloc(15);
    }
    const collect = async (source: AsyncIterable<Uint8Array>) => {
      const chunks = [];
      for await (const c of source) chunks.push(c);
      return Buffer.concat(chunks);
    };
    expect(await collect(pcm24ToMulaw(split()))).toEqual(await collect(pcm24ToMulaw(whole())));
    expect(await collect(pcm24ToMulaw(split()))).toEqual(Buffer.alloc(4, 255));
  });
  it("reserves spend before provider contact and requests raw telephone audio", async () => {
    const order: string[] = [];
    let url = "";
    let body: Record<string, unknown> = {};
    const stream = clonedSpeechStreams({
      voiceId: "clone1",
      elevenLabsKey: "test",
      openAIKey: "test",
      stockVoice: "nova",
      reserve: async () => {
        order.push("reserve");
      },
      fetchImpl: async (input, init) => {
        order.push("fetch");
        url = String(input);
        body = JSON.parse(String(init?.body));
        return new Response(new Uint8Array([255]));
      },
    });
    for await (const _chunk of stream.cloneSpeech("Hello", new AbortController().signal, {
      previousText: "Good morning.",
    })) {
      /* consume */
    }
    expect(order).toEqual(["reserve", "fetch"]);
    expect(url).toContain("output_format=ulaw_8000");
    expect(body).toMatchObject({
      previous_text: "Good morning.",
      model_id: "eleven_flash_v2_5",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        speed: 1,
        use_speaker_boost: false,
      },
    });
  });
  it("never contacts a provider when cost admission fails", async () => {
    let requests = 0;
    const stream = clonedSpeechStreams({
      voiceId: "clone1",
      elevenLabsKey: "test",
      openAIKey: "test",
      stockVoice: "nova",
      reserve: async () => {
        throw new Error("cap");
      },
      fetchImpl: async () => {
        requests++;
        return new Response();
      },
    });
    await expect(async () => {
      for await (const _chunk of stream.cloneSpeech("Hello", new AbortController().signal)) {
        /* consume */
      }
    }).rejects.toThrow("cap");
    expect(requests).toBe(0);
  });
});
