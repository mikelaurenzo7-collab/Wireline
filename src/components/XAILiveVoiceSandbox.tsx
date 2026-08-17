import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, PhoneOff, RotateCcw } from "lucide-react";

import AgentFace from "./AgentFace";
import { authFetch } from "../lib/api";
import { ConversationActivity, ConversationMessage, StatusNotice } from "./molecules";

type XAILiveSessionResponse = {
  clientSecret: string;
  websocketUrl: string;
  model: string;
  voice: string;
  greeting?: string;
  session: Record<string, unknown>;
  error?: string;
};

type Line = { id: string; role: "You" | "Agent"; text: string };
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "thinking" | "error";
type PendingToolCall = { name: string; callId: string; arguments: unknown };

const RATE = 24_000;
const CAPTURE_BUFFER_SIZE = 4_096;
const PLAYBACK_DRAIN_TIMEOUT_MS = 12_000;

function float32ToBase64Pcm(input: Float32Array): string {
  const pcm = new Int16Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const value = Math.max(-1, Math.min(1, input[index] || 0));
    pcm[index] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64PcmToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const output = new Float32Array(pcm.length);
  for (let index = 0; index < pcm.length; index += 1) {
    output[index] = pcm[index] / (pcm[index] < 0 ? 0x8000 : 0x7fff);
  }
  return output;
}

function voiceActivity(state: VoiceState) {
  if (state === "error")
    return {
      state: "failed" as const,
      title: "Live voice needs attention",
      detail: "The test stopped before the conversation could continue.",
    };
  if (state === "connecting")
    return {
      state: "pending" as const,
      title: "Connecting live voice",
      detail: "Starting a private native realtime session for this agent.",
    };
  if (state === "thinking")
    return {
      state: "active" as const,
      title: "Checking approved knowledge",
      detail: "Wireline is using only the agent's approved Training context.",
    };
  if (state === "speaking")
    return {
      state: "active" as const,
      title: "Agent speaking",
      detail: "You can interrupt naturally at any time.",
    };
  if (state === "listening")
    return {
      state: "complete" as const,
      title: "Listening",
      detail: "Microphone audio is streaming to this private live test.",
    };
  return {
    state: "pending" as const,
    title: "Ready for a private live test",
    detail: "Start a test to speak with this agent using its configured rules and Training facts.",
  };
}

export default function XAILiveVoiceSandbox({
  agentId,
  agentName,
  onAgentAudioDelta,
  onAgentAudioEnd,
  onTestStarted,
  onTestCompleted,
}: {
  agentId: string;
  agentName: string;
  onAgentAudioDelta?: (base64Pcm: string) => void;
  onAgentAudioEnd?: () => void;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);

  const socket = useRef<WebSocket | null>(null);
  const microphone = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const captureSource = useRef<MediaStreamAudioSourceNode | null>(null);
  const captureProcessor = useRef<ScriptProcessorNode | null>(null);
  const captureSink = useRef<GainNode | null>(null);
  const playbackSource = useRef<AudioBufferSourceNode | null>(null);
  const playbackQueue = useRef<Float32Array[]>([]);
  const playbackActive = useRef(false);
  const sessionReady = useRef(false);
  const pendingToolCalls = useRef<Map<string, PendingToolCall>>(new Map());
  const assistantLineId = useRef<string | null>(null);
  const userLineId = useRef<string | null>(null);
  const reportedStarted = useRef(false);
  const reportedCompleted = useRef(false);
  const generation = useRef(0);

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
    upsertLine(id, "Agent", text);
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

  const stopPlayback = useCallback(() => {
    try {
      playbackSource.current?.stop();
    } catch {
      // A source can already be stopped by its natural lifecycle.
    }
    playbackSource.current?.disconnect();
    playbackSource.current = null;
    playbackQueue.current = [];
    playbackActive.current = false;
  }, []);

  const playNextChunk = useCallback(() => {
    const context = audioContext.current;
    const chunk = playbackQueue.current.shift();
    if (!context || !chunk) {
      playbackActive.current = false;
      playbackSource.current = null;
      return;
    }

    playbackActive.current = true;
    const buffer = context.createBuffer(1, chunk.length, RATE);
    buffer.getChannelData(0).set(chunk);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    playbackSource.current = source;
    source.onended = () => {
      if (playbackSource.current === source) playbackSource.current = null;
      playNextChunk();
    };
    source.start();
  }, []);

  const playAudio = useCallback(
    (base64: string) => {
      if (!base64 || !audioContext.current) return;
      playbackQueue.current.push(base64PcmToFloat32(base64));
      if (!playbackActive.current) playNextChunk();
      onAgentAudioDelta?.(base64);
    },
    [onAgentAudioDelta, playNextChunk],
  );

  const waitForPlaybackDrain = useCallback(async () => {
    const startedAt = Date.now();
    while (
      (playbackActive.current || playbackQueue.current.length > 0) &&
      Date.now() - startedAt < PLAYBACK_DRAIN_TIMEOUT_MS
    ) {
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
  }, []);

  const release = useCallback(() => {
    sessionReady.current = false;
    pendingToolCalls.current.clear();
    socket.current?.close();
    microphone.current?.getTracks().forEach((track) => track.stop());
    captureProcessor.current?.disconnect();
    captureSource.current?.disconnect();
    captureSink.current?.disconnect();
    stopPlayback();
    void audioContext.current?.close();

    socket.current = null;
    microphone.current = null;
    captureProcessor.current = null;
    captureSource.current = null;
    captureSink.current = null;
    audioContext.current = null;
    assistantLineId.current = null;
    userLineId.current = null;
  }, [stopPlayback]);

  const stop = useCallback(() => {
    generation.current += 1;
    release();
    setState("idle");
  }, [release]);

  const fail = useCallback(
    (message: string) => {
      generation.current += 1;
      release();
      setError(message);
      setState("error");
    },
    [release],
  );

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

  const flushPendingTools = async (currentGeneration: number) => {
    const ws = socket.current;
    const calls = [...pendingToolCalls.current.values()];
    pendingToolCalls.current.clear();
    if (!calls.length || !ws || ws.readyState !== WebSocket.OPEN) return;

    setState("thinking");
    const outputs = await Promise.all(
      calls.map(async (call) => {
        try {
          const result = await runTool(call.name, call.arguments);
          return { callId: call.callId, result };
        } catch (reason) {
          return {
            callId: call.callId,
            result: { error: reason instanceof Error ? reason.message : "Tool unavailable." },
          };
        }
      }),
    );
    if (currentGeneration !== generation.current || ws.readyState !== WebSocket.OPEN) return;

    for (const output of outputs) {
      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: output.callId,
            output: JSON.stringify(output.result),
          },
        }),
      );
    }
    await waitForPlaybackDrain();
    if (currentGeneration === generation.current && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "response.create" }));
    }
  };

  const startCapture = async (ws: WebSocket, currentGeneration: number) => {
    const context = new AudioContext({ sampleRate: RATE });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: RATE,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (currentGeneration !== generation.current) {
      stream.getTracks().forEach((track) => track.stop());
      await context.close();
      return;
    }
    if (context.state === "suspended") await context.resume();

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(CAPTURE_BUFFER_SIZE, 1, 1);
    const sink = context.createGain();
    sink.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (!sessionReady.current || ws.readyState !== WebSocket.OPEN) return;
      const samples = event.inputBuffer.getChannelData(0);
      if (!samples.length) return;
      ws.send(
        JSON.stringify({
          type: "input_audio_buffer.append",
          audio: float32ToBase64Pcm(samples),
        }),
      );
    };
    source.connect(processor);
    processor.connect(sink);
    sink.connect(context.destination);

    audioContext.current = context;
    microphone.current = stream;
    captureSource.current = source;
    captureProcessor.current = processor;
    captureSink.current = sink;
  };

  const handleEvent = async (event: Record<string, unknown>, currentGeneration: number) => {
    if (currentGeneration !== generation.current) return;
    const type = String(event.type || "");

    if (
      (type === "response.output_audio.delta" || type === "response.audio.delta") &&
      typeof event.delta === "string"
    ) {
      playAudio(event.delta);
      setState("speaking");
    }
    if (
      (type === "response.output_audio_transcript.delta" || type === "response.output_text.delta") &&
      typeof event.delta === "string"
    ) {
      appendAssistant(event.delta);
      setState("speaking");
    }
    if (type === "conversation.item.input_audio_transcription.updated") {
      updateUserTranscript(
        typeof event.transcript === "string" ? event.transcript : "",
        event.item_id,
      );
    }
    if (type === "conversation.item.added") {
      const item = event.item as
        | { id?: unknown; role?: unknown; content?: Array<Record<string, unknown>> }
        | undefined;
      if (item?.role === "user" && Array.isArray(item.content)) {
        const transcript = item.content.find(
          (content) => content.type === "input_audio" && typeof content.transcript === "string",
        )?.transcript;
        if (typeof transcript === "string") updateUserTranscript(transcript, item.id);
      }
    }
    if (type === "input_audio_buffer.speech_started") {
      stopPlayback();
      setState("listening");
    }
    if (type === "response.function_call_arguments.done") {
      const name = typeof event.name === "string" ? event.name : "";
      const callId = typeof event.call_id === "string" ? event.call_id : "";
      if (name && callId) {
        let args: unknown = {};
        if (typeof event.arguments === "string") {
          try {
            args = JSON.parse(event.arguments);
          } catch {
            args = {};
          }
        }
        pendingToolCalls.current.set(callId, { name, callId, arguments: args });
      }
    }
    if (type === "response.done") {
      assistantLineId.current = null;
      userLineId.current = null;
      onAgentAudioEnd?.();
      if (pendingToolCalls.current.size) {
        await flushPendingTools(currentGeneration);
      } else {
        setState("listening");
      }
      if (reportedStarted.current && !reportedCompleted.current) {
        reportedCompleted.current = true;
        onTestCompleted?.();
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
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone-based live tests.");
      }
      const response = await authFetch("/api/voice/live/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      const session = (await response.json().catch(() => null)) as XAILiveSessionResponse | null;
      if (!response.ok || !session?.clientSecret || !session.websocketUrl || !session.session) {
        throw new Error(session?.error || "Live voice is unavailable for this agent.");
      }
      if (currentGeneration !== generation.current) return;

      const ws = new WebSocket(session.websocketUrl, [
        `xai-client-secret.${session.clientSecret}`,
      ]);
      socket.current = ws;
      void startCapture(ws, currentGeneration).catch((reason) => {
        if (currentGeneration === generation.current) {
          fail(
            reason instanceof Error
              ? reason.message
              : "Microphone access is required for live voice.",
          );
        }
      });

      ws.onmessage = (message) => {
        if (currentGeneration !== generation.current) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(String(message.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = String(event.type || "");
        if (type === "conversation.created") {
          ws.send(JSON.stringify({ type: "session.update", session: session.session }));
        }
        if (type === "session.updated" && !sessionReady.current) {
          sessionReady.current = true;
          reportedStarted.current = true;
          onTestStarted?.();
          setState("listening");
          const greeting = session.greeting?.trim();
          if (greeting) {
            ws.send(
              JSON.stringify({
                type: "conversation.item.create",
                item: {
                  type: "force_message",
                  role: "assistant",
                  interruptible: true,
                  content: [{ type: "output_text", text: greeting }],
                },
              }),
            );
          }
        }
        void handleEvent(event, currentGeneration);
      };
      ws.onerror = () => {
        if (currentGeneration === generation.current)
          fail("The live voice connection was interrupted. Start the test again to continue.");
      };
      ws.onclose = (event) => {
        if (currentGeneration !== generation.current) return;
        if (event.code !== 1000) {
          fail(
            event.reason || "The live voice connection ended. Start the test again to continue.",
          );
        }
      };
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

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="wl-presence__frame wl-presence--inline shrink-0">
            <div className="wl-presence__face">
              <AgentFace
                seed={agentName}
                size={44}
                speaking={state === "speaking"}
                title={`${agentName} face`}
              />
            </div>
          </div>
          <div className="min-w-0">
            <p className="wl-stitch-label">Live voice</p>
            <h3 className="mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.02em] text-foreground">
              Speak with <span className="wl-preserve-case">{agentName}</span>
            </h3>
            <p className="mt-1 max-w-2xl text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
              A private native realtime test using this agent's rules, facts, and voice profile.
            </p>
          </div>
        </div>
        <button
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
          {active ? "End live test" : "Start live test"}
        </button>
      </div>

      <ConversationActivity
        className="mt-4"
        state={activity.state}
        title={activity.title}
        detail={activity.detail}
        icon={<AudioLines aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
      />

      <div
        className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4"
        aria-live="polite"
        aria-label="Live voice transcript"
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
              Start a test, ask a real question, and interrupt naturally. This safe channel can
              search approved Training facts but cannot perform external actions.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <StatusNotice
          tone="destructive"
          className="mt-3"
          title="Live voice interrupted"
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
