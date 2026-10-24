type PendingTurn = {
  itemId: string;
  stoppedAtMs: number;
  responseIds: Set<string>;
  responseObserved: boolean;
};

const MAX_SAMPLES = 256;

function addSample(samples: number[], value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  if (samples.length === MAX_SAMPLES) samples.shift();
  samples.push(Math.round(value));
}

function percentile(samples: number[], fraction: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil((sorted.length - 1) * fraction)];
}

function eventId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** OpenAI's SIP sideband announces playback of a response's audio explicitly. */
export const OPENAI_TURN_AUDIO_START_EVENTS = ["output_audio_buffer.started"] as const;
/**
 * xAI's Voice Agent API emits no output_audio_buffer.* events, so the first
 * audio chunk of the response is the earliest proof the caller started hearing
 * an answer. Without it, every xAI call reported turnsWithAudio 0 and no
 * stopped-to-audio latency, which is exactly the pacing a caller notices.
 */
export const XAI_TURN_AUDIO_START_EVENTS = [
  "response.output_audio.delta",
  "response.audio.delta",
] as const;

export type TurnTimingOptions = {
  /** Event types that mark the first assistant audio for a caller turn. */
  audioStartEvents?: readonly string[];
};

/**
 * What firstAudioMs measures: "playback" is the provider confirming the
 * caller's audio buffer started playing (OpenAI); "generation" is the first
 * audio chunk leaving the provider (xAI), a few tens of ms before playback.
 */
export type FirstAudioSignal = "playback" | "generation";

/**
 * Measures the server-side interval after the provider declares the caller's
 * turn finished. The earlier semantic-VAD wait is not observable on a SIP
 * sideband. Only bounded numeric samples are retained; no audio or transcript
 * is stored.
 */
export class OpenAISipTurnTiming {
  private pending: PendingTurn | null = null;
  private readonly audioStartEvents: ReadonlySet<string>;
  private readonly stoppedToResponseMs: number[] = [];
  private readonly stoppedToAudioMs: number[] = [];
  private readonly toolConfirmationMs: number[] = [];
  private turnsObserved = 0;
  private turnsWithAudio = 0;
  private toolConfirmations = 0;
  private toolTimeouts = 0;
  private connectedAtMs: number | null = null;
  private firstAudioMs: number | null = null;
  private readonly firstAudioSignal: FirstAudioSignal;

  constructor(options: TurnTimingOptions = {}) {
    this.audioStartEvents = new Set(options.audioStartEvents ?? OPENAI_TURN_AUDIO_START_EVENTS);
    this.firstAudioSignal = [...this.audioStartEvents].every((type) =>
      (OPENAI_TURN_AUDIO_START_EVENTS as readonly string[]).includes(type),
    )
      ? "playback"
      : "generation";
  }

  /** Start the per-call time-to-first-audio clock (sideband open). */
  markConnected(nowMs = Date.now()): void {
    if (this.connectedAtMs === null) this.connectedAtMs = nowMs;
  }

  /**
   * Returns the stopped-to-audio latency when this event completed a caller
   * turn, so callers can act on a single slow reply; otherwise null.
   */
  observe(event: Record<string, unknown>, nowMs = Date.now()): number | null {
    const type = eventId(event.type);
    if (
      this.firstAudioMs === null &&
      this.connectedAtMs !== null &&
      this.audioStartEvents.has(type)
    ) {
      this.firstAudioMs = Math.max(0, Math.round(nowMs - this.connectedAtMs));
    }
    if (type === "input_audio_buffer.speech_stopped") {
      this.beginTurn(eventId(event.item_id), nowMs);
      return null;
    }
    if (type === "input_audio_buffer.committed") {
      const itemId = eventId(event.item_id);
      if (!this.pending || (itemId && this.pending.itemId && this.pending.itemId !== itemId)) {
        this.beginTurn(itemId, nowMs);
      }
      return null;
    }
    if (type === "response.created" && this.pending) {
      const response = event.response;
      const responseId =
        response && typeof response === "object" && !Array.isArray(response)
          ? eventId((response as Record<string, unknown>).id)
          : "";
      if (!responseId) return null;
      this.pending.responseIds.add(responseId);
      if (!this.pending.responseObserved) {
        addSample(this.stoppedToResponseMs, nowMs - this.pending.stoppedAtMs);
        this.pending.responseObserved = true;
      }
      return null;
    }
    if (this.audioStartEvents.has(type) && this.pending && this.belongsToPending(event)) {
      const latency = Math.max(0, Math.round(nowMs - this.pending.stoppedAtMs));
      addSample(this.stoppedToAudioMs, latency);
      this.turnsWithAudio += 1;
      this.pending = null;
      return latency;
    }
    return null;
  }

  /**
   * Audio belongs to the pending turn when its response id is one the turn
   * produced. A chunk without any response id counts only once the turn has
   * a response at all, so the forced opening line, which plays before the
   * caller's first turn, can never be mistaken for an answer.
   */
  private belongsToPending(event: Record<string, unknown>): boolean {
    const responseId = eventId(event.response_id);
    if (responseId) return this.pending!.responseIds.has(responseId);
    return this.pending!.responseObserved;
  }

  observeToolConfirmation(durationMs: number, timedOut: boolean): void {
    this.toolConfirmations += 1;
    if (timedOut) this.toolTimeouts += 1;
    addSample(this.toolConfirmationMs, durationMs);
  }

  summary() {
    return {
      firstAudioMs: this.firstAudioMs,
      firstAudioSignal: this.firstAudioSignal,
      turnsObserved: this.turnsObserved,
      turnsWithAudio: this.turnsWithAudio,
      stoppedToResponseP50Ms: percentile(this.stoppedToResponseMs, 0.5),
      stoppedToResponseP95Ms: percentile(this.stoppedToResponseMs, 0.95),
      stoppedToAudioP50Ms: percentile(this.stoppedToAudioMs, 0.5),
      stoppedToAudioP95Ms: percentile(this.stoppedToAudioMs, 0.95),
      toolConfirmations: this.toolConfirmations,
      toolTimeouts: this.toolTimeouts,
      toolConfirmationP50Ms: percentile(this.toolConfirmationMs, 0.5),
      toolConfirmationP95Ms: percentile(this.toolConfirmationMs, 0.95),
    };
  }

  private beginTurn(itemId: string, nowMs: number): void {
    this.turnsObserved += 1;
    this.pending = {
      itemId,
      stoppedAtMs: nowMs,
      responseIds: new Set(),
      responseObserved: false,
    };
  }
}
