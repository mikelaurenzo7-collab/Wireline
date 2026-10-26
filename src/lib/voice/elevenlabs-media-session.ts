import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

/** Minimal transport contract; providers and carrier are injectable in tests. */
export interface MediaPeer {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}
type Event = {
  type?: string;
  event?: string;
  streamSid?: string;
  media?: { track?: string; payload?: string };
  mark?: { name?: string };
  response?: { id?: string; [key: string]: unknown };
  session?: {
    audio?: { input?: { turn_detection?: object; [key: string]: unknown }; [key: string]: unknown };
    [key: string]: unknown;
  };
  response_id?: string;
  item_id?: string;
  delta?: string;
  [key: string]: unknown;
};

function parseEvent(raw: unknown): Event {
  const parsed: unknown = JSON.parse(String(raw));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Expected an event object");
  return parsed as Event;
}
export type SpeechStream = (
  text: string,
  signal: AbortSignal,
  context?: { previousText: string },
) => AsyncIterable<Uint8Array>;

type SpeechJob = {
  text: string;
  previousText: string;
  signal: AbortSignal;
  prepared?: Promise<{ audio: Uint8Array } | { failed: true }>;
};

const MAX_SPEECH_BYTES = 8_000 * 60;

/**
 * Adapts OpenAI's text-output Realtime socket to the existing call runner.
 * Only ElevenLabs audio reaches Twilio. Carrier marks, never model completion,
 * confirm playback. A clear invalidates marks and cancels all pending synthesis.
 */
export class ElevenLabsMediaSession extends EventEmitter {
  readyState = 0;
  private generation = 0;
  private controller = new AbortController();
  private work = Promise.resolve();
  private text = "";
  private previousText = "";
  private speechQueue: SpeechJob[] = [];
  private canPrefetch = false;
  private responseId = "";
  private itemId = "";
  private queuedChars = 0;
  private stock = false;
  private speaking = false;
  private modelResponding = false;
  private cancelledResponses = new Set<string>();
  private pendingCompletions = new Set<Event>();
  private initialized = false;
  private marks = new Map<
    string,
    { finish: (played: boolean) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private earlyAudio: string[] = [];
  private earlyAudioBytes = 0;

  constructor(
    private readonly options: {
      carrier: MediaPeer;
      model: MediaPeer;
      streamSid: string;
      cloneSpeech: SpeechStream;
      stockSpeech: SpeechStream;
      onClonePlayed: () => Promise<void>;
      onFallback: () => void;
      markTimeoutMs?: number;
      initialStock?: boolean;
    },
  ) {
    super();
    this.stock = options.initialStock === true;
    const listen = (peer: MediaPeer, event: string, fn: (...args: unknown[]) => void) => {
      peer.on(event, fn);
    };
    listen(options.model, "open", () => {
      this.readyState = 1;
      this.emit("open");
      if (this.stock) {
        this.options.onFallback();
        this.event({
          type: "botbound.voice_fallback",
          reason: "clone_unavailable",
        });
      }
    });
    listen(options.model, "pong", () => this.emit("pong"));
    listen(options.model, "message", (data) => this.modelEvent(data));
    listen(options.model, "error", () => this.fail("Realtime connection failed"));
    listen(options.model, "close", () => this.close());
    listen(options.carrier, "message", (data) => this.carrierEvent(data));
    listen(options.carrier, "error", () => this.close());
    listen(options.carrier, "close", () => this.close());
  }

  private event(event: Event) {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
  private finishResponse(event: Event) {
    if (this.pendingCompletions.delete(event)) this.event(event);
  }
  private flushCompletions() {
    for (const event of this.pendingCompletions) this.finishResponse(event);
  }
  private modelSend(event: Event) {
    if (this.options.model.readyState === 1) this.options.model.send(JSON.stringify(event));
  }
  private carrierSend(event: Event) {
    if (this.options.carrier.readyState !== 1) throw new Error("Carrier disconnected");
    if (this.options.carrier.bufferedAmount > 256_000) throw new Error("Carrier backpressure");
    this.options.carrier.send(JSON.stringify({ ...event, streamSid: this.options.streamSid }));
  }

  send(raw: string) {
    const event = parseEvent(raw);
    if (event.type === "session.update") {
      const session = event.session ?? {};
      const audio = session.audio ?? {};
      // Partial updates must not reset instructions/tools, but output is always text.
      event.session = {
        ...session,
        type: "realtime",
        output_modalities: ["text"],
        audio: {
          input: {
            ...(audio.input ?? {}),
            format: { type: "audio/pcmu" },
            turn_detection: {
              ...(audio.input?.turn_detection ?? { type: "semantic_vad" }),
              interrupt_response: false,
            },
          },
        },
      };
    }
    if (event.type === "response.create") {
      event.response = {
        ...(event.response ?? {}),
        output_modalities: ["text"],
      };
    }
    this.modelSend(event);
  }

  private carrierEvent(raw: unknown) {
    if (this.readyState === 3) return;
    let event: Event;
    try {
      event = parseEvent(raw);
    } catch {
      this.fail("Invalid carrier frame");
      return;
    }
    if (event.streamSid && event.streamSid !== this.options.streamSid) {
      this.fail("Stream identity mismatch");
      return;
    }
    if (event.event === "stop") {
      this.close();
      return;
    }
    if (event.event === "mark") {
      const name = event.mark?.name;
      const mark = typeof name === "string" ? this.marks.get(name) : undefined;
      if (mark) {
        this.marks.delete(name!);
        clearTimeout(mark.timer);
        mark.finish(true);
      }
    }
    if (event.event !== "media" || event.media?.track !== "inbound") return;
    const audio = event.media?.payload;
    if (
      typeof audio !== "string" ||
      audio.length > 16_384 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(audio)
    ) {
      this.fail("Invalid carrier audio");
      return;
    }
    if (!this.initialized) {
      this.earlyAudioBytes += audio.length;
      if (this.earlyAudioBytes > 128_000) {
        this.fail("Realtime startup too slow");
        return;
      }
      this.earlyAudio.push(audio);
      return;
    }
    this.modelSend({ type: "input_audio_buffer.append", audio });
  }

  private modelEvent(raw: unknown) {
    if (this.readyState !== 1) return;
    let event: Event;
    try {
      event = parseEvent(raw);
    } catch {
      this.fail("Invalid realtime frame");
      return;
    }
    if (event.type === "session.updated" && !this.initialized) {
      this.initialized = true;
      for (const audio of this.earlyAudio)
        this.modelSend({ type: "input_audio_buffer.append", audio });
      this.earlyAudio = [];
      this.earlyAudioBytes = 0;
    }
    if (event.type === "input_audio_buffer.speech_started") this.interrupt();
    if (event.type === "response.created") {
      this.responseId = event.response?.id ?? "";
      this.previousText = "";
      this.modelResponding = true;
    }
    if (event.type === "response.output_text.delta") {
      if (this.cancelledResponses.has(String(event.response_id))) return;
      this.itemId = event.item_id ?? this.itemId;
      this.text += String(event.delta ?? "");
      if (this.text.length + this.queuedChars > 8_000) {
        this.fail("Speech queue exceeded");
        return;
      }
      // Speak complete clauses as they arrive; bound long unpunctuated replies.
      let end: number;
      // A token ending in punctuation is not necessarily a sentence ending:
      // "No. 19." + "50", "https:" + "//...", and "Dr." + " Smith" must stay intact.
      while ((end = speechBoundary(this.text)) >= 0 || this.text.length >= 240) {
        // Punctuation can be much later than the limit, and a long word may
        // have no spaces. Neither case should create an unbounded request or
        // hundreds of one-character provider calls.
        const wordBoundary = this.text.lastIndexOf(" ", 240);
        const length = end >= 0 && end < 240 ? end + 1 : wordBoundary > 0 ? wordBoundary : 240;
        const chunk = this.text.slice(0, length);
        this.text = this.text.slice(length);
        this.enqueueSpeech(chunk);
      }
      return;
    }
    if (event.type === "response.output_text.done") {
      if (this.cancelledResponses.has(String(event.response_id))) return;
      this.enqueueSpeech(this.text);
      this.text = "";
      return;
    }
    if (event.type === "response.done") {
      if (this.cancelledResponses.delete(String(event.response?.id))) {
        this.event(event);
        return;
      }
      this.modelResponding = false;
      this.enqueueSpeech(this.text);
      this.text = "";
      const generation = this.generation;
      this.pendingCompletions.add(event);
      // Usage and tool outputs remain intact, but do not run the next turn
      // while synthesized speech from this response is still playing. Clear
      // and close flush these completions even if synthesis never resolves.
      this.work = this.work.then(() => {
        if (generation === this.generation && this.readyState === 1) {
          if (this.speaking) {
            this.speaking = false;
            this.event({
              type: "output_audio_buffer.stopped",
              response_id: event.response?.id,
            });
          }
          this.itemId = "";
        }
        this.finishResponse(event);
      });
      return;
    }
    // No native model audio is ever forwarded to the phone.
    if (/^response\.(output_)?audio/.test(String(event.type))) return;
    this.event(event);
  }

  private enqueueSpeech(value: string) {
    const text = value.trim();
    if (!text) return;
    const generation = this.generation;
    const responseId = this.responseId;
    const signal = this.controller.signal;
    const job: SpeechJob = { text, previousText: this.previousText, signal };
    this.previousText = (this.previousText + " " + text).trim().slice(-1_000);
    this.speechQueue.push(job);
    this.prefetchNext();
    this.queuedChars += text.length;
    this.work = this.work
      .then(async () => {
        if (signal.aborted || generation !== this.generation || this.readyState !== 1) return;
        this.canPrefetch = false;
        if (this.speechQueue[0] === job) this.speechQueue.shift();
        const synthesize = async (speech: SpeechStream): Promise<boolean> => {
          let bytes = 0;
          const source = job.prepared
            ? preparedSpeech(job.prepared)
            : speech(text, signal, { previousText: job.previousText });
          // A failed prefetched request follows the same single stock retry.
          job.prepared = undefined;
          for await (const chunk of source) {
            if (signal.aborted || generation !== this.generation) return false;
            if (!chunk.length) continue;
            bytes += chunk.length;
            if (bytes > MAX_SPEECH_BYTES) throw new Error("Speech duration exceeded");
            if (!this.speaking) {
              this.speaking = true;
              this.event({
                type: "output_audio_buffer.started",
                response_id: responseId,
              });
            }
            // 20 ms mu-law frames; limits carrier buffering and aids interruption.
            for (let offset = 0; offset < chunk.length; offset += 160) {
              this.carrierSend({
                event: "media",
                media: {
                  payload: Buffer.from(chunk.subarray(offset, offset + 160)).toString("base64"),
                },
              });
            }
          }
          if (!bytes) throw new Error("Speech provider returned empty audio");
          return true;
        };
        try {
          try {
            if (
              !(await synthesize(this.stock ? this.options.stockSpeech : this.options.cloneSpeech))
            )
              return;
          } catch (error) {
            if (signal.aborted) return;
            if (this.stock) throw error;
            // Flush partial clone audio before the stock retry. The retry repeats
            // only this short clause, never a tool action or the whole response.
            this.carrierSend({ event: "clear" });
            this.stock = true;
            this.options.onFallback();
            this.event({
              type: "botbound.voice_fallback",
              reason: "provider_error",
            });
            if (!(await synthesize(this.options.stockSpeech))) return;
          }
          const playback = this.waitForPlayback(signal);
          // Prepare just the next clause while the caller hears this one.
          // Never send it or claim it was heard until the preceding mark arrives.
          this.canPrefetch = true;
          this.prefetchNext();
          const played = await playback;
          if (generation === this.generation) this.canPrefetch = false;
          if (!played || signal.aborted) return;
          this.event({
            type: "response.output_audio_transcript.delta",
            delta: text + " ",
            response_id: responseId,
          });
          if (!this.stock) await this.options.onClonePlayed();
        } finally {
          if (generation === this.generation)
            this.queuedChars = Math.max(0, this.queuedChars - text.length);
        }
      })
      .catch(() => {
        if (!signal.aborted) this.fail("Speech playback failed");
      });
    this.work = this.work.then(() => {
      if (
        generation === this.generation &&
        this.queuedChars === 0 &&
        this.speaking &&
        !this.modelResponding
      ) {
        this.speaking = false;
        this.event({
          type: "output_audio_buffer.stopped",
          response_id: responseId,
        });
      }
    });
  }

  private prefetchNext() {
    const next = this.speechQueue[0];
    if (!this.canPrefetch || !next || next.prepared || next.signal.aborted) return;
    const speech = this.stock ? this.options.stockSpeech : this.options.cloneSpeech;
    next.prepared = (async () => {
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of speech(next.text, next.signal, {
        previousText: next.previousText,
      })) {
        if (next.signal.aborted) return { failed: true as const };
        bytes += chunk.length;
        if (bytes > MAX_SPEECH_BYTES) throw new Error("Speech duration exceeded");
        chunks.push(chunk);
      }
      if (!bytes) throw new Error("Speech provider returned empty audio");
      return { audio: Buffer.concat(chunks) };
    })().catch(() => ({ failed: true as const }));
  }

  private waitForPlayback(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      const name = randomUUID();
      const abort = () => {
        const row = this.marks.get(name);
        if (row) clearTimeout(row.timer);
        this.marks.delete(name);
        resolve(false);
      };
      const timer = setTimeout(() => {
        this.marks.delete(name);
        signal.removeEventListener("abort", abort);
        reject(new Error("Carrier playback timeout"));
      }, this.options.markTimeoutMs ?? 65_000);
      this.marks.set(name, {
        timer,
        finish: (played) => {
          signal.removeEventListener("abort", abort);
          resolve(played);
        },
      });
      signal.addEventListener("abort", abort, { once: true });
      try {
        this.carrierSend({ event: "mark", mark: { name } });
      } catch (error) {
        clearTimeout(timer);
        this.marks.delete(name);
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    });
  }

  private interrupt() {
    if (!this.modelResponding && !this.speaking && !this.queuedChars && !this.text) return;
    this.generation += 1;
    this.canPrefetch = false;
    this.speechQueue = [];
    this.previousText = "";
    this.controller.abort();
    this.controller = new AbortController();
    this.text = "";
    this.queuedChars = 0;
    this.work = Promise.resolve();
    if (this.modelResponding) this.modelSend({ type: "response.cancel" });
    if (this.responseId) this.cancelledResponses.add(this.responseId);
    if (this.cancelledResponses.size > 32)
      this.cancelledResponses.delete(this.cancelledResponses.values().next().value!);
    this.modelResponding = false;
    // Text responses cannot be audio-truncated. Remove the interrupted model
    // item so it does not assume the caller heard its unsaid remainder.
    if (this.itemId)
      this.modelSend({
        type: "conversation.item.delete",
        item_id: this.itemId,
      });
    this.itemId = "";
    this.carrierSend({ event: "clear" });
    this.speaking = false;
    this.event({
      type: "output_audio_buffer.cleared",
      response_id: this.responseId,
    });
    // Cancelling audible speech cannot undo already-completed model work.
    // Release its lifecycle/usage event once, without claiming playback.
    this.flushCompletions();
  }

  ping() {
    this.options.model.ping();
  }
  terminate() {
    this.close(1011, "Voice session ended");
  }
  close(code = 1000, reason = "Call ended") {
    if (this.readyState === 3) return;
    this.flushCompletions();
    this.readyState = 3;
    this.controller.abort();
    this.speechQueue = [];
    this.canPrefetch = false;
    this.previousText = "";
    for (const mark of this.marks.values()) {
      clearTimeout(mark.timer);
      mark.finish(false);
    }
    this.marks.clear();
    this.earlyAudio = [];
    this.options.model.close(code, reason);
    this.options.carrier.close(code, reason);
    this.emit("close", code, Buffer.from(reason));
  }
  private fail(message: string) {
    if (this.readyState === 3) return;
    if (this.listenerCount("error")) this.emit("error", new Error(message));
    this.close(1011, message);
  }
}

/** Wait for a real sentence boundary, retaining abbreviations and decimals. */
function speechBoundary(text: string): number {
  const boundaries = /[.!?\n](?:["”’')\]]*)(?=\s)/gu;
  for (const match of text.matchAll(boundaries)) {
    const end = match.index!;
    const prefix = text.slice(0, end + 1);
    if (match[0][0] === "." && /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|etc)|\b[A-Z])\.$/u.test(prefix))
      continue;
    return end + match[0].length - 1;
  }
  return -1;
}

async function* preparedSpeech(
  result: NonNullable<SpeechJob["prepared"]>,
): AsyncIterable<Uint8Array> {
  const prepared = await result;
  if ("failed" in prepared) throw new Error("Speech preparation failed");
  yield prepared.audio;
}
