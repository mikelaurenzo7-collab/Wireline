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

/**
 * Measures the server-side interval after OpenAI declares the caller's turn
 * finished. The earlier semantic-VAD wait is not observable on a SIP sideband.
 * Only bounded numeric samples are retained; no audio or transcript is stored.
 */
export class OpenAISipTurnTiming {
  private pending: PendingTurn | null = null;
  private readonly stoppedToResponseMs: number[] = [];
  private readonly stoppedToAudioMs: number[] = [];
  private readonly toolConfirmationMs: number[] = [];
  private turnsObserved = 0;
  private turnsWithAudio = 0;
  private toolConfirmations = 0;
  private toolTimeouts = 0;

  observe(event: Record<string, unknown>, nowMs = Date.now()): void {
    const type = eventId(event.type);
    if (type === "input_audio_buffer.speech_stopped") {
      this.beginTurn(eventId(event.item_id), nowMs);
      return;
    }
    if (type === "input_audio_buffer.committed") {
      const itemId = eventId(event.item_id);
      if (!this.pending || (itemId && this.pending.itemId && this.pending.itemId !== itemId)) {
        this.beginTurn(itemId, nowMs);
      }
      return;
    }
    if (type === "response.created" && this.pending) {
      const response = event.response;
      const responseId =
        response && typeof response === "object" && !Array.isArray(response)
          ? eventId((response as Record<string, unknown>).id)
          : "";
      if (!responseId) return;
      this.pending.responseIds.add(responseId);
      if (!this.pending.responseObserved) {
        addSample(this.stoppedToResponseMs, nowMs - this.pending.stoppedAtMs);
        this.pending.responseObserved = true;
      }
      return;
    }
    if (
      type === "output_audio_buffer.started" &&
      this.pending?.responseIds.has(eventId(event.response_id))
    ) {
      addSample(this.stoppedToAudioMs, nowMs - this.pending.stoppedAtMs);
      this.turnsWithAudio += 1;
      this.pending = null;
    }
  }

  observeToolConfirmation(durationMs: number, timedOut: boolean): void {
    this.toolConfirmations += 1;
    if (timedOut) this.toolTimeouts += 1;
    addSample(this.toolConfirmationMs, durationMs);
  }

  summary() {
    return {
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
