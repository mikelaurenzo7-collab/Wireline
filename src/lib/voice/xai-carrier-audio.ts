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
  const pendingMarks = new Set<string>();
  // Bound startup on an already-answered, billable phone call. Reset while
  // greeting audio flows so a long disclosure can finish.
  let openingTimeout: ReturnType<typeof setTimeout> | undefined;
  const waitForOpening = () => {
    clearTimeout(openingTimeout);
    openingTimeout = setTimeout(() => {
      if (model.readyState === WebSocket.OPEN) model.close(1011, "Opening audio unavailable");
    }, 20_000);
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
    if (frame.event === "mark" && pendingMarks.delete(frame.mark?.name)) {
      openingPlayed = true;
      clearTimeout(openingTimeout);
      model.emit("message", Buffer.from(JSON.stringify({ type: "output_audio_buffer.stopped" })));
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
    if (event.type === "session.updated") configured = true;
    if (
      (event.type === "response.output_audio.delta" || event.type === "response.audio.delta") &&
      typeof event.delta === "string" &&
      event.delta
    ) {
      hasAudio = true;
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
      pendingMarks.add(name);
      sendCarrier({ event: "mark", mark: { name } });
    } else if (event.type === "input_audio_buffer.speech_started" && openingPlayed) {
      hasAudio = false;
      pendingMarks.clear();
      sendCarrier({ event: "clear" });
    }
  });
}
