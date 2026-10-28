import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  CircleAlert,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  RotateCcw,
  Search,
  Volume2,
} from "lucide-react";

import { authFetch } from "../lib/api";
import { VOICE_PRESENCE } from "../lib/voice-presence";
import type { BotMarkKey } from "../lib/bot-mark";
import { ConversationMessage, StatusNotice } from "./molecules";

type SignalResponse = {
  sdp: string;
  cleanupToken?: string;
  greeting?: string;
  maxDurationSeconds?: number;
};
type Line = { id: string; role: "You" | "Bot"; text: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";

const RATE = 24_000;

function microphoneMessage(reason: unknown): string {
  const name = reason instanceof DOMException ? reason.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "The browser blocked the microphone. Allow access for this site, or type a test below.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "No microphone was found. Connect one, or type a test below.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "The microphone is busy in another app. Close it, or type a test below.";
  if (name === "SecurityError") return "The microphone needs a secure page. Type a test below.";
  // Non-microphone failures carry their own truthful message (session refusal,
  // missing cleanup capability, provider unavailability). Only collapse to the
  // microphone guidance when no meaningful reason survived.
  if (reason instanceof Error && reason.message.trim()) return reason.message;
  return "The microphone didn't start. Allow access, or type a test below.";
}

function rehearsalReply(raw: string): string {
  let reply = "";
  for (const block of raw.split("\n\n")) {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("");
    if (!data) continue;
    try {
      const payload = JSON.parse(data) as { reply?: unknown };
      if (typeof payload.reply === "string" && payload.reply.trim()) reply = payload.reply.trim();
    } catch {
      // Incomplete SSE blocks are ignored until a reply event arrives.
    }
  }
  return reply;
}

// Signature and tenant checks belong to the server; the browser only requires
// a usable opaque capability before attaching an accepted provider session.
function responseCleanupToken(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2_048 &&
    value.trim() === value
    ? value
    : null;
}

function floatToBase64Pcm(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

function waitForIceGathering(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(done, 5_000);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    function onChange() {
      if (peer.iceGatheringState === "complete") done();
    }
    peer.addEventListener("icegatheringstatechange", onChange);
  });
}

function voiceActivity(state: VoiceState) {
  if (state === "error")
    return {
      title: "Live Voice Needs Attention",
      icon: CircleAlert,
    };
  if (state === "connecting")
    return {
      title: "Connecting Live Voice",
      icon: Loader2,
    };
  if (state === "thinking")
    return {
      title: VOICE_PRESENCE.thinking,
      icon: Search,
    };
  if (state === "speaking")
    return {
      title: VOICE_PRESENCE.speaking,
      icon: Volume2,
    };
  if (state === "listening")
    return {
      title: VOICE_PRESENCE.listening,
      icon: Mic,
    };
  return {
    title: "Ready for a Voice Rehearsal",
    icon: Mic,
  };
}

export default function OpenAILiveVoiceSandbox({
  agentId,
  agentName,
  compact = false,
  startButtonId,
  onAgentAudioDelta,
  onAgentAudioEnd,
  onTestStarted,
  onTestCompleted,
}: {
  agentId: string;
  agentName: string;
  markKey?: BotMarkKey | null;
  compact?: boolean;
  startButtonId?: string;
  onAgentAudioDelta?: (base64Pcm: string) => void;
  onAgentAudioEnd?: () => void;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  // Mute can be chosen while browser permission is pending. Apply the latest
  // intent before attaching a newly acquired microphone to the connection.
  const desiredMuted = useRef(false);
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const audioPlaying = useRef(false);
  const knowledgeChecks = useRef(0);
  const analysisContext = useRef<AudioContext | null>(null);
  const analysisSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const analysisProcessor = useRef<ScriptProcessorNode | null>(null);
  const analysisSink = useRef<GainNode | null>(null);
  const assistantLineId = useRef<string | null>(null);
  const userLineId = useRef<string | null>(null);
  const reportedStarted = useRef(false);
  const reportedCompleted = useRef(false);
  const generation = useRef(0);
  const deadlineTimer = useRef<number | null>(null);
  const cleanupToken = useRef<string | null>(null);

  const releaseServerCall = useCallback((token: string | null | undefined) => {
    if (!token) return;
    // Peer and microphone teardown is immediate. The encrypted, account-bound
    // capability also closes an accepted provider call if signaling completed
    // after this view was left; its durable deadline remains the fallback.
    void authFetch("/api/voice/live/session/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cleanupToken: token }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  const upsertLine = (id: string, role: Line["role"], text: string, replace = false) => {
    if (!text) return;
    setLines((current) => {
      const index = current.findIndex((line) => line.id === id);
      if (index < 0) return [...current, { id, role, text }].slice(-16);
      const next = [...current];
      next[index] = { ...next[index], text: replace ? text : `${next[index].text}${text}` };
      return next;
    });
  };

  const appendAssistant = (text: string) => {
    if (!text) return;
    const id =
      assistantLineId.current || `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    assistantLineId.current = id;
    upsertLine(id, "Bot", text);
  };

  const updateUserTranscript = (text: string, itemId?: unknown) => {
    if (!text) return;
    const id =
      typeof itemId === "string" && itemId
        ? `user-${itemId}`
        : userLineId.current || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    userLineId.current = id;
    upsertLine(id, "You", text, true);
  };

  const release = useCallback(() => {
    const token = cleanupToken.current;
    cleanupToken.current = null;
    releaseServerCall(token);
    if (deadlineTimer.current !== null) window.clearTimeout(deadlineTimer.current);
    deadlineTimer.current = null;
    channel.current?.close();
    peer.current?.close();
    microphone.current?.getTracks().forEach((track) => track.stop());
    analysisProcessor.current?.disconnect();
    analysisSource.current?.disconnect();
    analysisSink.current?.disconnect();
    void analysisContext.current?.close();
    if (remoteAudio.current) {
      remoteAudio.current.pause();
      remoteAudio.current.srcObject = null;
    }
    channel.current = null;
    peer.current = null;
    microphone.current = null;
    analysisProcessor.current = null;
    analysisSource.current = null;
    analysisSink.current = null;
    analysisContext.current = null;
    remoteAudio.current = null;
    audioPlaying.current = false;
    knowledgeChecks.current = 0;
    assistantLineId.current = null;
    userLineId.current = null;
  }, [releaseServerCall]);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    desiredMuted.current = false;
    setMuted(false);
    setState("idle");
  }, [release]);

  const fail = useCallback(
    (message: string) => {
      generation.current += 1;
      release();
      desiredMuted.current = false;
      setMuted(false);
      setError(message);
      setState("error");
    },
    [release],
  );

  const attachRemoteAudio = (stream: MediaStream) => {
    const element = new Audio();
    element.autoplay = true;
    element.srcObject = stream;
    remoteAudio.current = element;
    void element.play().catch(() => undefined);
    if (!onAgentAudioDelta) return;
    const context = new AudioContext({ sampleRate: RATE });
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;
    processor.onaudioprocess = (event) => {
      const samples = event.inputBuffer.getChannelData(0);
      if (samples.length) onAgentAudioDelta(floatToBase64Pcm(samples));
    };
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);
    analysisContext.current = context;
    analysisSource.current = source;
    analysisProcessor.current = processor;
    analysisSink.current = sink;
  };

  const runTool = async (name: string, args: unknown) => {
    const response = await authFetch("/api/voice/live/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, name, arguments: args }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof body?.error === "string" ? body.error : "Approved knowledge is unavailable.",
      );
    return body?.result || {};
  };

  const handleEvent = async (event: Record<string, unknown>, currentGeneration: number) => {
    if (currentGeneration !== generation.current) return;
    const updateActivity = () =>
      setState(
        audioPlaying.current ? "speaking" : knowledgeChecks.current > 0 ? "thinking" : "listening",
      );
    const type = String(event.type || "");
    if (
      (type === "response.output_audio_transcript.delta" ||
        type === "response.output_text.delta") &&
      typeof event.delta === "string"
    ) {
      appendAssistant(event.delta);
    }
    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.input_audio_transcription.delta"
    )
      updateUserTranscript(
        typeof event.transcript === "string"
          ? event.transcript
          : typeof event.delta === "string"
            ? event.delta
            : "",
        event.item_id,
      );
    if (type === "input_audio_buffer.speech_started") updateActivity();
    if (type === "output_audio_buffer.started") {
      audioPlaying.current = true;
      updateActivity();
    }
    if (type === "output_audio_buffer.stopped" || type === "output_audio_buffer.cleared") {
      audioPlaying.current = false;
      updateActivity();
    }
    if (type === "response.done") {
      assistantLineId.current = null;
      userLineId.current = null;
      onAgentAudioEnd?.();
      if (reportedStarted.current && !reportedCompleted.current) {
        reportedCompleted.current = true;
        onTestCompleted?.();
      }
      updateActivity();
    }
    if (type === "response.function_call_arguments.done") {
      const name = typeof event.name === "string" ? event.name : "";
      const callId = typeof event.call_id === "string" ? event.call_id : "";
      if (!name || !callId) return;
      knowledgeChecks.current += 1;
      updateActivity();
      let result: unknown;
      try {
        result = await runTool(
          name,
          typeof event.arguments === "string" ? JSON.parse(event.arguments) : {},
        );
      } catch (reason) {
        result = { error: reason instanceof Error ? reason.message : "Tool unavailable." };
      }
      if (currentGeneration !== generation.current) return;
      knowledgeChecks.current = Math.max(0, knowledgeChecks.current - 1);
      updateActivity();
      const dataChannel = channel.current;
      if (dataChannel?.readyState === "open" && currentGeneration === generation.current) {
        dataChannel.send(
          JSON.stringify({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: callId,
              output: JSON.stringify(result),
            },
          }),
        );
        dataChannel.send(JSON.stringify({ type: "response.create" }));
      }
    }
    if (type === "error") {
      const detail = event.error as { message?: unknown } | undefined;
      fail(
        typeof detail?.message === "string" ? detail.message : "Live voice encountered an error.",
      );
    }
  };

  const sendTyped = async (event: FormEvent) => {
    event.preventDefault();
    const content = typed.trim();
    if (!content || typing) return;
    setTyped("");
    setError("");
    const line = { id: crypto.randomUUID(), role: "You" as const, text: content };
    setLines((current) => [...current, line]);
    const dataChannel = channel.current;
    if (dataChannel?.readyState === "open") {
      dataChannel.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: content }],
          },
        }),
      );
      dataChannel.send(JSON.stringify({ type: "response.create" }));
      return;
    }
    setTyping(true);
    try {
      const history = lines.slice(-12).map((item) => ({
        role: item.role === "You" ? "customer" : "employee",
        content: item.text,
      }));
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/test/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, history }),
      });
      const raw = await response.text();
      const reply = rehearsalReply(raw);
      if (!response.ok || !reply) throw new Error("The typed test did not return a reply.");
      setLines((current) => [...current, { id: crypto.randomUUID(), role: "Bot", text: reply }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The typed test did not return a reply.");
    } finally {
      setTyping(false);
    }
  };

  const start = async () => {
    if (["connecting", "listening", "speaking", "thinking"].includes(state)) return;
    stop();
    const currentGeneration = generation.current;
    reportedStarted.current = false;
    reportedCompleted.current = false;
    setError("");
    setLines([]);
    setState("connecting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      if (currentGeneration !== generation.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      // Retain each acquired resource before the next browser operation can
      // throw, so fail() can always stop a microphone or partially built peer.
      microphone.current = mic;
      mic.getAudioTracks().forEach((track) => {
        track.enabled = !desiredMuted.current;
      });
      const connection = new RTCPeerConnection();
      peer.current = connection;
      const events = connection.createDataChannel("oai-events");
      channel.current = events;
      mic.getTracks().forEach((track) => connection.addTrack(track, mic));
      connection.ontrack = (event) => {
        if (currentGeneration !== generation.current) return;
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        attachRemoteAudio(remoteStream);
      };
      connection.onconnectionstatechange = () => {
        if (currentGeneration !== generation.current) return;
        if (connection.connectionState === "connected") setState("listening");
        if (["failed", "closed"].includes(connection.connectionState))
          fail("Live voice connection ended. Start the rehearsal again to continue.");
      };
      events.onmessage = (message) => {
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        void handleEvent(event, currentGeneration);
      };
      events.onopen = () => {
        if (currentGeneration !== generation.current) return;
        reportedStarted.current = true;
        onTestStarted?.();
        setState("listening");
      };
      events.onerror = () => {
        if (currentGeneration === generation.current)
          fail("The live voice event channel was interrupted.");
      };

      const offer = await connection.createOffer();
      if (currentGeneration !== generation.current) return;
      await connection.setLocalDescription(offer);
      if (currentGeneration !== generation.current) return;
      await waitForIceGathering(connection);
      if (currentGeneration !== generation.current) return;
      const sdp = connection.localDescription?.sdp || offer.sdp || "";
      const response = await authFetch("/api/voice/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, sdp }),
      });
      const session = (await response.json().catch(() => null)) as SignalResponse | null;
      const acceptedCleanupToken = responseCleanupToken(session?.cleanupToken);
      if (currentGeneration !== generation.current) {
        releaseServerCall(acceptedCleanupToken);
        return;
      }
      cleanupToken.current = acceptedCleanupToken;
      if (!response.ok || typeof session?.sdp !== "string" || !session.sdp.startsWith("v=")) {
        const sessionError = (session as { error?: unknown } | null)?.error;
        throw new Error(
          typeof sessionError === "string"
            ? sessionError
            : "Live voice is unavailable for this agent.",
        );
      }
      if (!acceptedCleanupToken) {
        throw new Error("Voice rehearsal could not be controlled safely. Try again.");
      }
      await connection.setRemoteDescription({ type: "answer", sdp: session.sdp });
      if (currentGeneration !== generation.current) return;
      const maxDurationSeconds = Math.max(15, Math.min(300, session.maxDurationSeconds || 300));
      deadlineTimer.current = window.setTimeout(() => {
        if (currentGeneration !== generation.current) return;
        stop();
      }, maxDurationSeconds * 1_000);
      const greeting = session.greeting?.trim();
      if (greeting) {
        const sendGreeting = () => {
          if (currentGeneration !== generation.current || events.readyState !== "open") return;
          events.send(
            JSON.stringify({
              type: "response.create",
              response: { instructions: `Begin the conversation with this greeting: ${greeting}` },
            }),
          );
        };
        if (events.readyState === "open") sendGreeting();
        else events.addEventListener("open", sendGreeting, { once: true });
      }
    } catch (reason) {
      if (currentGeneration === generation.current) fail(microphoneMessage(reason));
    }
  };

  useEffect(() => () => stop(), [stop]);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);
  const activity = voiceActivity(state);
  const showActivity = !compact || state !== "idle" || lines.length > 0;
  const mutedListening = muted && state === "listening";
  const StateIcon = mutedListening ? MicOff : activity.icon;
  const showTranscript = !compact || lines.length > 0;

  return (
    <section
      className={`rounded-xl border border-border bg-card shadow-sm ${compact ? "p-4 sm:p-5" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            {!compact ? <p className="wl-stitch-label">Voice Rehearsal</p> : null}
            <h3
              className={
                compact
                  ? "break-words text-lg font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]"
                  : "mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground"
              }
            >
              Speak With <span className="wl-preserve-case">{agentName}</span>
            </h3>
          </div>
        </div>
        <button
          id={startButtonId}
          type="button"
          onClick={active ? stop : () => void start()}
          className={active ? "studio-secondary-button" : "studio-primary-button"}
        >
          {state === "connecting" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : active ? (
            <PhoneOff size={16} />
          ) : (
            <Mic size={16} />
          )}
          {active ? "End Rehearsal" : "Start Rehearsal"}
        </button>
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => void sendTyped(event)}
      >
        <label className="sr-only" htmlFor={`${startButtonId || agentId}-typed-test`}>
          Type a test
        </label>
        <input
          id={`${startButtonId || agentId}-typed-test`}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Type a test line"
          maxLength={4000}
          disabled={typing}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="studio-secondary-button"
          disabled={typing || !typed.trim()}
        >
          {typing ? "Sending…" : "Send test"}
        </button>
      </form>

      {showActivity ? (
        <div className="wl-voice-bar" data-state={state}>
          <StateIcon
            className={`wl-voice-bar__icon${state === "connecting" ? " animate-spin motion-reduce:animate-none" : ""}`}
            aria-hidden="true"
          />
          <span className="wl-voice-bar__label" role="status" aria-live="polite">
            <span>{mutedListening ? "Microphone Muted" : activity.title}</span>
            {muted && !mutedListening ? (
              <span className="wl-voice-bar__muted">Microphone Muted</span>
            ) : null}
          </span>
          {active ? (
            <button
              type="button"
              className="studio-secondary-button wl-voice-bar__mute"
              aria-pressed={muted}
              onClick={() => {
                const next = !desiredMuted.current;
                desiredMuted.current = next;
                microphone.current?.getAudioTracks().forEach((track) => {
                  track.enabled = !next;
                });
                setMuted(next);
              }}
            >
              {muted ? (
                <MicOff size={14} aria-hidden="true" />
              ) : (
                <Mic size={14} aria-hidden="true" />
              )}
              {muted ? "Unmute" : "Mute"}
            </button>
          ) : null}
        </div>
      ) : null}

      {showTranscript ? (
        <div
          className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4"
          aria-live="polite"
          aria-label="Voice Rehearsal Transcript"
        >
          {lines.length ? (
            lines.map((line) => (
              <ConversationMessage
                key={line.id}
                author={line.role === "You" ? "customer" : "assistant"}
                channel="voice"
                label={line.role === "You" ? "You" : agentName}
              >
                {line.text}
              </ConversationMessage>
            ))
          ) : (
            <div className="grid min-h-[96px] place-items-center text-center">
              <p className="max-w-md text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
                Ask a real question and interrupt naturally. This private rehearsal can search
                approved Training facts but cannot perform external actions.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <StatusNotice
          tone="destructive"
          className="mt-3"
          title="Live Voice Interrupted"
          action={
            <button
              type="button"
              onClick={() => {
                stop();
                setError("");
              }}
              aria-label="Reset Live Voice"
              className="grid h-11 w-11 place-items-center rounded-md hover:bg-secondary"
            >
              <RotateCcw size={14} />
            </button>
          }
        >
          {error}
        </StatusNotice>
      ) : null}
    </section>
  );
}
