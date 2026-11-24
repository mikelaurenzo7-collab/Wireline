import WebSocket from "ws";
import { XAI_REALTIME_WEBSOCKET_URL } from "./realtime-provider";
import { resolveXAIGrokVoiceModel, resolveXAIReasoningEffort } from "./xai-voice-config";

/** The signed carrier socket is the answered phone call. Only its audio travels
 * here. The existing call runner owns instructions, tools, usage and settlement. */
export function connectXaiCarrierAudio(carrier: WebSocket, streamSid: string, apiKey: string) {
  const url = new URL(XAI_REALTIME_WEBSOCKET_URL);
  url.searchParams.set("model", resolveXAIGrokVoiceModel());
  url.searchParams.set("reasoning.effort", resolveXAIReasoningEffort());
  const model = new WebSocket(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    handshakeTimeout: 10_000,
    maxPayload: 1_048_576,
  });
  bridgeXaiAudio(carrier, model, streamSid);
  return model;
}

export function bridgeXaiAudio(carrier: WebSocket, model: WebSocket, streamSid: string): void {
  let configured = false;
  let openingPlayed = false;
  let hasAudio = false;
  let markSequence = 0;
  const pendingMarks = new Map<string, string[]>();
  // PCMU is 8,000 one-byte samples per second. The local playback clock
  // estimates how much is queued; a carrier mark remains the authority for
  // completed playback. Keep chunks until the corresponding mark arrives.
  let queuedUntil = 0;
  const playback = new Map<string, {
    itemId: string;
    contentIndex: number;
    responseId: string;
    chunks: { start: number; duration: number }[];
  }>();
  const interruptedResponses = new Set<string>();
  // Bound startup on an already-answered, billable phone call. Reset while
  // greeting audio flows so a long disclosure can finish.
  let openingTimeout: ReturnType<typeof setTimeout> | undefined;
  const waitForOpening = () => {
    clearTimeout(openingTimeout);
    openingTimeout = setTimeout(() => {
      if (model.readyState === WebSocket.OPEN) model.close(1011, "Opening audio unavailable");
    }, 20_000 + Math.max(0, queuedUntil - Date.now()));
    openingTimeout.unref();
  };
  model.once("open", waitForOpening);
  const sendCarrier = (message: object) => {
    if (carrier.readyState === WebSocket.OPEN)
      carrier.send(JSON.stringify({ ...message, streamSid }));
  };
  const endModel = () => {
    if (model.readyState === WebSocket.OPEN) model.close(1000, "Carrier ended call");
    else if (model.readyState === WebSocket.CONNECTING) model.terminate();
  };
  carrier.once("close", endModel);
  model.once("close", () => {
    clearTimeout(openingTimeout);
    carrier.off("message", fromCarrier);
    carrier.off("close", endModel);
    if (carrier.readyState === WebSocket.OPEN) carrier.close(1000, "Voice session ended");
  });
  function fromCarrier(raw: WebSocket.RawData) {
    let frame;
    try {
      frame = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!frame || frame.streamSid !== streamSid) return;
    if (frame.event === "stop") return endModel();
    if (frame.event === "mark") {
      const played = pendingMarks.get(frame.mark?.name);
      if (played) {
        pendingMarks.delete(frame.mark.name);
        for (const key of played) playback.delete(key);
        if (!pendingMarks.size && !hasAudio) queuedUntil = Date.now();
        openingPlayed = true;
        clearTimeout(openingTimeout);
        model.emit("message", Buffer.from(JSON.stringify({ type: "output_audio_buffer.stopped" })));
      }
    }
    if (
      configured &&
      openingPlayed &&
      model.readyState === WebSocket.OPEN &&
      frame.event === "media" &&
      typeof frame.media?.payload === "string"
    ) {
      model.send(JSON.stringify({ type: "input_audio_buffer.append", audio: frame.media.payload }));
    }
  }
  carrier.on("message", fromCarrier);
  model.on("message", (raw: WebSocket.RawData) => {
    let event;
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!event) return;
    if (typeof event.response_id === "string" && interruptedResponses.has(event.response_id)) return;
    if (typeof event.response?.id === "string" && interruptedResponses.has(event.response.id)) return;
    if (event.type === "session.updated") configured = true;
    if (
      (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") &&
      typeof event.delta === "string" &&
      event.delta
    ) {
      const responseId = typeof event.response_id === "string" ? event.response_id : "";
      hasAudio = true;
      const duration = Buffer.from(event.delta, "base64").length / 8;
      const start = Math.max(Date.now(), queuedUntil);
      queuedUntil = start + duration;
      if (typeof event.item_id === "string" && event.item_id) {
        const contentIndex = Number.isInteger(event.content_index) ? event.content_index : 0;
        const key = JSON.stringify([event.item_id, contentIndex]);
        const item = playback.get(key) ?? {
          itemId: event.item_id,
          contentIndex,
          responseId,
          chunks: [],
        };
        item.chunks.push({ start, duration });
        playback.set(key, item);
      }
      if (!openingPlayed) waitForOpening();
      sendCarrier({ event: "media", media: { payload: event.delta } });
    } else if (
      (event.type === "response.output_audio.done" ||
        event.type === "response.audio.done" ||
        event.type === "response.done") &&
      hasAudio
    ) {
      hasAudio = false;
      const name = `audio-${++markSequence}`;
      pendingMarks.set(name, [...playback.keys()]);
      sendCarrier({ event: "mark", mark: { name } });
    } else if (event.type === "input_audio_buffer.speech_started" && openingPlayed) {
      hasAudio = false;
      // Cleared marks are echoed by Twilio too; discard their identities
      // before clearing so they never count as played. xAI server VAD
      // cancels generation; explicitly truncate its history to heard audio.
      pendingMarks.clear();
      sendCarrier({ event: "clear" });
      const now = Date.now();
      for (const item of playback.values()) {
        if (item.responseId) interruptedResponses.add(item.responseId);
        const total = item.chunks.reduce((sum, chunk) => sum + chunk.duration, 0);
        const played = item.chunks.reduce(
          (sum, chunk) => sum + Math.min(chunk.duration, Math.max(0, now - chunk.start)),
          0,
        );
        if (played < total && model.readyState === WebSocket.OPEN) {
          model.send(JSON.stringify({
            type: "conversation.item.truncate",
            item_id: item.itemId,
            content_index: item.contentIndex,
            audio_end_ms: Math.floor(played),
          }));
        }
      }
      playback.clear();
      queuedUntil = 0;
      // Bound retained response IDs on long calls.
      while (interruptedResponses.size > 128) {
        const oldest = interruptedResponses.values().next().value;
        if (oldest === undefined) break;
        interruptedResponses.delete(oldest);
      }
    }
  });
}
