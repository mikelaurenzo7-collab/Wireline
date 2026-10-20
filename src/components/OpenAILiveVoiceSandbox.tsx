import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, MicOff, PhoneOff, RotateCcw } from "lucide-react";

import { authFetch } from "../lib/api";
import type { BotMarkKey } from "../lib/bot-mark";
import { ConversationActivity, ConversationMessage, StatusNotice } from "./molecules";

type SignalResponse = {
  sdp: string;
  cleanupToken?: string;
  greeting?: string;
  maxDurationSeconds?: number;
};
type Line = { id: string; role: "You" | "Bot"; text: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";

const RATE = 24_000;

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
      state: "failed" as const,
      title: "Live Voice Needs Attention",
      detail: "The rehearsal stopped before the conversation could continue.",
    };
  if (state === "connecting")
    return {
      state: "pending" as const,
      title: "Connecting Live Voice",
      detail: "Setting up a private browser session for this agent.",
    };
  if (state === "thinking")
    return {
      state: "active" as const,
      title: "Checking Approved Knowledge",
      detail: "BotBound is using only the agent's approved Training context.",
    };
  if (state === "speaking")
    return {
      state: "active" as const,
      title: "Bot Speaking",
      detail: "You can interrupt naturally at any time.",
    };
  if (state === "listening")
    return {
      state: "complete" as const,
      title: "Listening",
      detail: "Microphone audio is processed only for this private rehearsal.",
    };
  return {
    state: "pending" as const,
    title: "Ready for a Voice Rehearsal",
    detail: "Start a rehearsal to speak with this Bot using its rules and Training facts.",
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
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const peer = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
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
    assistantLineId.current = null;
    userLineId.current = null;
  }, [releaseServerCall]);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    setMuted(false);
    setState("idle");
  }, [release]);

  const fail = useCallback(
    (message: string) => {
      generation.current += 1;
      release();
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
    const type = String(event.type || "");
    if (
      (type === "response.output_audio_transcript.delta" ||
        type === "response.output_text.delta") &&
      typeof event.delta === "string"
    ) {
      appendAssistant(event.delta);
      setState("speaking");
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
    if (type === "input_audio_buffer.speech_started") setState("listening");
    if (type === "output_audio_buffer.started") setState("speaking");
    if (type === "output_audio_buffer.stopped") setState("listening");
    if (type === "response.done") {
      assistantLineId.current = null;
      userLineId.current = null;
      onAgentAudioEnd?.();
      if (reportedStarted.current && !reportedCompleted.current) {
        reportedCompleted.current = true;
        onTestCompleted?.();
      }
      setState("listening");
    }
    if (type === "response.function_call_arguments.done") {
      const name = typeof event.name === "string" ? event.name : "";
      const callId = typeof event.call_id === "string" ? event.call_id : "";
      if (!name || !callId) return;
      setState("thinking");
      let result: unknown;
      try {
        result = await runTool(
          name,
          typeof event.arguments === "string" ? JSON.parse(event.arguments) : {},
        );
      } catch (reason) {
        result = { error: reason instanceof Error ? reason.message : "Tool unavailable." };
      }
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
          setError("The live voice event channel was interrupted.");
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
        generation.current += 1;
        release();
        setState("idle");
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
      if (currentGeneration === generation.current)
        fail(
          reason instanceof Error
            ? reason.message
            : "Microphone access is required for live voice.",
        );
    }
  };

  useEffect(() => () => stop(), [stop]);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);
  const activity = voiceActivity(state);
  const showActivity = !compact || state !== "idle" || lines.length > 0;
  const showTranscript = !compact || lines.length > 0;

  return (
    <section
      className={`rounded-xl border border-border bg-card shadow-sm ${compact ? "p-4 sm:p-5" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            {!compact ? <p className="wl-stitch-label">Voice rehearsal</p> : null}
            <h3
              className={
                compact
                  ? "break-words text-lg font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]"
                  : "mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground"
              }
            >
              Speak with <span className="wl-preserve-case">{agentName}</span>
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
          {active ? "End rehearsal" : "Start rehearsal"}
        </button>
      </div>

      <div className="wl-voice-bar" data-state={state} role="status" aria-live="polite">
        <span className="wl-voice-bar__meter" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
        <span className="wl-voice-bar__label">{activity.title}</span>
        {active ? (
          <button
            type="button"
            className="studio-secondary-button wl-voice-bar__mute"
            aria-pressed={muted}
            onClick={() => {
              const next = !muted;
              microphone.current?.getAudioTracks().forEach((track) => {
                track.enabled = !next;
              });
              setMuted(next);
            }}
          >
            {muted ? <MicOff size={14} aria-hidden="true" /> : <Mic size={14} aria-hidden="true" />}
            {muted ? "Unmute" : "Mute"}
          </button>
        ) : null}
      </div>

      {showActivity ? (
        <ConversationActivity
          className="mt-4"
          state={activity.state}
          title={activity.title}
          detail={activity.detail}
          icon={<AudioLines aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
        />
      ) : null}

      {showTranscript ? (
        <div
          className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4"
          aria-live="polite"
          aria-label="Voice rehearsal transcript"
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
                setError("");
                setState("idle");
              }}
              aria-label="Reset live voice"
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
