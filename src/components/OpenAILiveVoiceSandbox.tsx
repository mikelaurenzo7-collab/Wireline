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
import { parseSseEvents } from "../hooks/useStreamingChat";
import {
  arrayBufferToBase64,
  createRelayPlayback,
  startRelayCapture,
  type RelayCapture,
  type RelayPlayback,
} from "../lib/rehearsal-relay-audio";
import {
  readTypedRehearsal,
  saveTypedRehearsal,
  type TextRehearsalLine,
} from "../lib/typed-rehearsal-history";
import { VOICE_PRESENCE } from "../lib/voice-presence";
import type { BotMarkKey } from "../lib/bot-mark";
import { ConversationMessage, StatusNotice } from "./molecules";

type SignalResponse = {
  sdp: string;
  cleanupToken?: string;
  greeting?: string;
  maxDurationSeconds?: number;
};
/** xAI rehearsal through BotBound's relay, or "webrtc" to send an OpenAI offer. */
type RelaySessionResponse = {
  transport?: "relay" | "webrtc";
  relayPath?: string;
  protocol?: string;
  ticket?: string;
  cleanupToken?: string;
  maxDurationSeconds?: number;
  error?: unknown;
};
type RelayEvent = {
  type?: string;
  id?: unknown;
  text?: unknown;
  final?: unknown;
  append?: unknown;
  active?: unknown;
  completed?: unknown;
  answeredOwner?: unknown;
  reason?: unknown;
  message?: unknown;
  maxDurationSeconds?: unknown;
};
type Line = TextRehearsalLine & { channel: "text" | "voice" };
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
  let failed = false;
  // A provisional reply can precede an error or a disconnected stream.
  parseSseEvents(raw.split("\n"), (event, data) => {
    if (event === "error") failed = true;
    if (event === "done") reply = typeof data?.reply === "string" ? data.reply.trim() : "";
  });
  return failed ? "" : reply;
}

type VoiceResponse = {
  status?: string;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{ transcript?: string; text?: string }>;
  }>;
};

function completedAssistantReply(response?: VoiceResponse): boolean {
  return (
    response?.status === "completed" &&
    Array.isArray(response.output) &&
    response.output.some(
      (item) =>
        item?.type === "message" &&
        item.role === "assistant" &&
        Array.isArray(item.content) &&
        item.content.some(
          (part) =>
            (typeof part?.transcript === "string" && part.transcript.trim()) ||
            (typeof part?.text === "string" && part.text.trim()),
        ),
    )
  );
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

function relayUrl(path: string): string | null {
  if (!path.startsWith("/api/")) return null;
  const url = new URL(path, window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
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
  historyOwnerId,
  compact = false,
  startButtonId,
  onAgentAudioDelta,
  onAgentAudioEnd,
  onTestStarted,
  onTestCompleted,
  onTestEnded,
}: {
  agentId: string;
  agentName: string;
  historyOwnerId?: string;
  markKey?: BotMarkKey | null;
  compact?: boolean;
  startButtonId?: string;
  onAgentAudioDelta?: (base64Pcm: string) => void;
  onAgentAudioEnd?: () => void;
  onTestStarted?: () => void;
  onTestCompleted?: () => void;
  /**
   * A started voice rehearsal ended: `replied` when the Bot finished a reply in
   * it, `failed` when it ended on an error rather than by Stop or its time limit.
   */
  onTestEnded?: (result: { replied: boolean; failed: boolean }) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [muted, setMuted] = useState(false);
  const [typed, setTyped] = useState("");
  const [typing, setTyping] = useState(false);
  const [typedError, setTypedError] = useState("");
  // Mute can be chosen while browser permission is pending. Apply the latest
  // intent before attaching a newly acquired microphone to the connection.
  const desiredMuted = useRef(false);
  const [voiceError, setVoiceError] = useState("");
  const [lines, setLines] = useState<Line[]>(() =>
    readTypedRehearsal(historyOwnerId, agentId).map((line) => ({ ...line, channel: "text" })),
  );
  const completedText = useRef<TextRehearsalLine[]>(lines);
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
  const relaySocket = useRef<WebSocket | null>(null);
  const relayContext = useRef<AudioContext | null>(null);
  const relayCapture = useRef<RelayCapture | null>(null);
  const relayPlayback = useRef<RelayPlayback | null>(null);
  const relayReady = useRef(false);
  const relayEnd = useRef<{ reason: string; message: string } | null>(null);
  // Teardown callbacks are stable, so they read the latest handler from here.
  const testEnded = useRef(onTestEnded);
  testEnded.current = onTestEnded;
  const endingOnError = useRef(false);
  // The owner spoke or typed, and the Bot then finished a reply to them.
  const ownerSpoke = useRef(false);
  const answeredOwner = useRef(false);
  // The relay could not connect from this browser; later rehearsals use WebRTC.
  const relayBlocked = useRef(false);

  function clearTranscript() {
    completedText.current = [];
    setLines([]);
    saveTypedRehearsal(historyOwnerId, agentId, []);
  }

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

  const upsertLine = (
    id: string,
    role: Line["role"],
    text: string,
    channel: Line["channel"],
    replace = false,
  ) => {
    if (!text) return;
    setLines((current) => {
      const index = current.findIndex((line) => line.id === id);
      if (index < 0) return [...current, { id, role, text, channel }].slice(-16);
      const next = [...current];
      next[index] = { ...next[index], text: replace ? text : `${next[index].text}${text}` };
      return next;
    });
  };

  const updateAssistant = (
    text: string,
    channel: Line["channel"],
    itemId: unknown,
    replace: boolean,
  ) => {
    if (!text) return;
    const id =
      typeof itemId === "string" && itemId
        ? `assistant-${itemId}`
        : assistantLineId.current || `assistant-${crypto.randomUUID()}`;
    assistantLineId.current = id;
    upsertLine(id, "Bot", text, channel, replace);
  };

  const updateUserTranscript = (text: string, itemId: unknown, replace: boolean) => {
    if (!text) return;
    const id =
      typeof itemId === "string" && itemId
        ? `user-${itemId}`
        : userLineId.current || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    userLineId.current = id;
    upsertLine(id, "You", text, "voice", replace);
  };

  const release = useCallback(() => {
    const token = cleanupToken.current;
    cleanupToken.current = null;
    releaseServerCall(token);
    if (deadlineTimer.current !== null) window.clearTimeout(deadlineTimer.current);
    deadlineTimer.current = null;
    relayCapture.current?.stop();
    relayPlayback.current?.flush();
    if (relaySocket.current && relaySocket.current.readyState <= WebSocket.OPEN)
      relaySocket.current.close(1000, "Rehearsal ended");
    void relayContext.current?.close().catch(() => undefined);
    relayCapture.current = null;
    relayPlayback.current = null;
    relaySocket.current = null;
    relayContext.current = null;
    relayReady.current = false;
    relayEnd.current = null;
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
    const failed = endingOnError.current;
    endingOnError.current = false;
    if (reportedStarted.current) {
      reportedStarted.current = false;
      testEnded.current?.({ replied: answeredOwner.current, failed });
    }
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
      endingOnError.current = true;
      release();
      desiredMuted.current = false;
      setMuted(false);
      setVoiceError(message);
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

  const updateActivity = () =>
    setState(
      audioPlaying.current ? "speaking" : knowledgeChecks.current > 0 ? "thinking" : "listening",
    );

  const handleRelayEvent = (event: RelayEvent, currentGeneration: number) => {
    if (currentGeneration !== generation.current) return;
    const type = String(event.type || "");
    if (type === "ready") {
      relayReady.current = true;
      clearTranscript();
      reportedStarted.current = true;
      onTestStarted?.();
      const seconds = Number(event.maxDurationSeconds);
      const maxDurationSeconds = Math.max(
        15,
        Math.min(300, Number.isFinite(seconds) ? seconds : 300),
      );
      if (deadlineTimer.current !== null) window.clearTimeout(deadlineTimer.current);
      deadlineTimer.current = window.setTimeout(() => {
        if (currentGeneration === generation.current) stop();
      }, maxDurationSeconds * 1_000);
      updateActivity();
      return;
    }
    if (type === "bot_text" && typeof event.text === "string") {
      updateAssistant(event.text, "voice", event.id, event.final === true);
      if (event.final === true) assistantLineId.current = null;
      return;
    }
    if (type === "caller_text" && typeof event.text === "string") {
      updateUserTranscript(event.text, event.id, event.append !== true);
      if (event.final === true) {
        userLineId.current = null;
        if (event.text.trim()) ownerSpoke.current = true;
      }
      return;
    }
    if (type === "interrupt") {
      relayPlayback.current?.flush();
      return;
    }
    if (type === "thinking") {
      knowledgeChecks.current = Math.max(0, knowledgeChecks.current + (event.active ? 1 : -1));
      updateActivity();
      return;
    }
    if (type === "turn_done") {
      assistantLineId.current = null;
      userLineId.current = null;
      // The relay knows when a reply answered the owner, even if the owner's
      // own transcript is still arriving.
      if (event.answeredOwner === true || (event.completed === true && ownerSpoke.current))
        answeredOwner.current = true;
      if (event.completed === true && reportedStarted.current && !reportedCompleted.current) {
        reportedCompleted.current = true;
        onTestCompleted?.();
      }
      updateActivity();
      return;
    }
    if (type === "ended") {
      relayEnd.current = {
        reason: typeof event.reason === "string" ? event.reason : "",
        message: typeof event.message === "string" ? event.message : "",
      };
    }
  };

  /** xAI rehearsal: microphone and replies travel over BotBound's relay. */
  const startRelay = async (
    mic: MediaStream,
    context: AudioContext,
    session: RelaySessionResponse,
    currentGeneration: number,
  ) => {
    const token = responseCleanupToken(session.cleanupToken);
    cleanupToken.current = token;
    const url = relayUrl(typeof session.relayPath === "string" ? session.relayPath : "");
    if (!token || !url || typeof session.ticket !== "string" || !session.protocol) {
      throw new Error("Voice rehearsal could not be controlled safely. Try again.");
    }
    relayContext.current = context;
    void context.resume().catch(() => undefined);
    const socket = new WebSocket(url, [session.protocol, `ticket.${session.ticket}`]);
    socket.binaryType = "arraybuffer";
    relaySocket.current = socket;
    relayPlayback.current = createRelayPlayback(context, {
      onActive: () => {
        if (currentGeneration !== generation.current) return;
        audioPlaying.current = true;
        updateActivity();
      },
      onIdle: () => {
        if (currentGeneration !== generation.current) return;
        audioPlaying.current = false;
        onAgentAudioEnd?.();
        if (relayReady.current) updateActivity();
      },
    });
    socket.onmessage = (message) => {
      if (currentGeneration !== generation.current) return;
      if (message.data instanceof ArrayBuffer) {
        relayPlayback.current?.enqueue(message.data);
        if (onAgentAudioDelta) onAgentAudioDelta(arrayBufferToBase64(message.data));
        return;
      }
      let event: RelayEvent;
      try {
        event = JSON.parse(String(message.data)) as RelayEvent;
      } catch {
        return;
      }
      handleRelayEvent(event, currentGeneration);
    };
    socket.onopen = () => {
      if (currentGeneration !== generation.current) return;
      relayCapture.current = startRelayCapture(context, mic, (pcm) => {
        if (relayReady.current && socket.readyState === WebSocket.OPEN) socket.send(pcm);
      });
    };
    socket.onclose = () => {
      if (currentGeneration !== generation.current) return;
      if (!relayReady.current) {
        // The relay never became ready here (a network that blocks WebSockets,
        // or a restart). End that server session through its ticket, which
        // returns its allowance, and rehearse on the backup voice instead.
        relayBlocked.current = true;
        stop();
        void start();
        return;
      }
      const ended = relayEnd.current;
      // The server already closed the provider session; nothing to clean up.
      cleanupToken.current = null;
      if (ended?.reason === "stopped" || ended?.reason === "time_limit") {
        stop();
        return;
      }
      fail(ended?.message || "Live voice connection ended. Start the rehearsal again to continue.");
    };
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
      updateAssistant(
        event.delta,
        type === "response.output_text.delta" ? "text" : "voice",
        event.item_id,
        false,
      );
    }
    if (type === "response.output_audio_transcript.done" && typeof event.transcript === "string")
      updateAssistant(event.transcript, "voice", event.item_id, true);
    if (type === "response.output_text.done" && typeof event.text === "string")
      updateAssistant(event.text, "text", event.item_id, true);
    if (
      type === "input_audio_buffer.committed" ||
      (type === "conversation.item.input_audio_transcription.completed" &&
        typeof event.transcript === "string" &&
        event.transcript.trim())
    )
      ownerSpoke.current = true;
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
        typeof event.transcript === "string",
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
      const response = event.response as VoiceResponse | undefined;
      if (response?.status === "failed") {
        fail(
          "The Bot could not finish its voice reply. Start the rehearsal again or type a test below.",
        );
        return;
      }
      if (ownerSpoke.current && completedAssistantReply(response)) answeredOwner.current = true;
      if (
        reportedStarted.current &&
        !reportedCompleted.current &&
        completedAssistantReply(response)
      ) {
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
    if (!content || typing || waitingForVoice) return;
    const currentGeneration = generation.current;
    setTyped("");
    setTypedError("");
    if (state === "error") {
      setVoiceError("");
      setState("idle");
    }
    const line: Line = { id: crypto.randomUUID(), role: "You", text: content, channel: "text" };
    setLines((current) => [...current, line]);
    const socket = relaySocket.current;
    if (socket?.readyState === WebSocket.OPEN && relayReady.current) {
      ownerSpoke.current = true;
      socket.send(JSON.stringify({ type: "user_text", text: content }));
      return;
    }
    const dataChannel = channel.current;
    if (dataChannel?.readyState === "open") {
      ownerSpoke.current = true;
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
        content: item.text.slice(0, 4000),
      }));
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/test/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, history }),
      });
      const raw = await response.text();
      if (currentGeneration !== generation.current) return;
      const reply = rehearsalReply(raw);
      if (!response.ok || !reply) throw new Error("The typed test did not return a reply.");
      const answer: Line = { id: crypto.randomUUID(), role: "Bot", text: reply, channel: "text" };
      setLines((current) => [...current, answer]);
      completedText.current = [...completedText.current, line, answer].slice(-12);
      saveTypedRehearsal(historyOwnerId, agentId, completedText.current);
    } catch (reason) {
      if (currentGeneration !== generation.current) return;
      setLines((current) => current.filter((item) => item.id !== line.id));
      setTyped(content);
      setTypedError(
        reason instanceof Error ? reason.message : "The typed test did not return a reply.",
      );
    } finally {
      if (currentGeneration === generation.current) setTyping(false);
    }
  };

  const start = async () => {
    if (["connecting", "listening", "speaking", "thinking"].includes(state)) return;
    stop();
    const currentGeneration = generation.current;
    reportedStarted.current = false;
    reportedCompleted.current = false;
    ownerSpoke.current = false;
    answeredOwner.current = false;
    setVoiceError("");
    setTypedError("");
    setState("connecting");
    // Created inside the click so the browser lets relayed replies play.
    let context: AudioContext | null = null;
    try {
      context =
        !relayBlocked.current && typeof AudioContext === "function" ? new AudioContext() : null;
    } catch {
      context = null;
    }
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
        void context?.close().catch(() => undefined);
        return;
      }
      // Retain each acquired resource before the next browser operation can
      // throw, so fail() can always stop a microphone or partially built peer.
      microphone.current = mic;
      mic.getAudioTracks().forEach((track) => {
        track.enabled = !desiredMuted.current;
      });
      if (context) {
        // Ask for the voice callers hear first. The server answers "webrtc"
        // when that provider is unavailable, and the offer below takes over.
        relayContext.current = context;
        const relayResponse = await authFetch("/api/voice/live/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, transport: "relay" }),
        });
        const relaySession = (await relayResponse
          .json()
          .catch(() => null)) as RelaySessionResponse | null;
        if (currentGeneration !== generation.current) {
          releaseServerCall(responseCleanupToken(relaySession?.cleanupToken));
          return;
        }
        if (!relayResponse.ok) {
          throw new Error(
            typeof relaySession?.error === "string"
              ? relaySession.error
              : "Live voice is unavailable for this Bot.",
          );
        }
        if (relaySession?.transport === "relay") {
          await startRelay(mic, context, relaySession, currentGeneration);
          return;
        }
        relayContext.current = null;
        void context.close().catch(() => undefined);
      }
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
        if (connection.connectionState === "connected" && events.readyState === "open")
          setState("listening");
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
        clearTranscript();
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
            : "Live voice is unavailable for this Bot.",
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
      // A context the relay never took over (microphone refused, WebRTC path)
      // is closed here; release() closes the one it did.
      if (context && relayContext.current !== context) void context.close().catch(() => undefined);
      if (currentGeneration === generation.current) fail(microphoneMessage(reason));
    }
  };

  useEffect(() => () => stop(), [stop]);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);
  const waitingForVoice = state === "connecting";
  const activity = voiceActivity(state);
  const showActivity =
    !compact || state !== "idle" || lines.some((line) => line.channel === "voice");
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
            <p className="wl-stitch-label">Private Rehearsal</p>
            <h3
              className={
                compact
                  ? "break-words text-lg font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]"
                  : "mt-1 font-display text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-tight text-foreground"
              }
            >
              Speak With <span className="wl-preserve-case">{agentName}</span>
            </h3>
          </div>
        </div>
        <button
          id={startButtonId}
          type="button"
          disabled={typing && !active}
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
          disabled={typing || waitingForVoice}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          className="studio-secondary-button"
          disabled={typing || waitingForVoice || !typed.trim()}
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
          aria-label="Rehearsal Transcript"
        >
          {lines.length ? (
            lines.map((line) => (
              <ConversationMessage
                key={line.id}
                author={line.role === "You" ? "customer" : "assistant"}
                channel={line.channel}
                label={line.role === "You" ? "You" : agentName}
              >
                {line.text}
              </ConversationMessage>
            ))
          ) : (
            <div className="grid min-h-[96px] place-items-center text-center">
              <p className="max-w-md text-[length:var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">
                Ask a real question and interrupt naturally. This private rehearsal can search
                approved Knowledge but cannot perform external actions.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {lines.length > 0 && !active && !typing ? (
        <button type="button" className="studio-secondary-button mt-3" onClick={clearTranscript}>
          Clear transcript
        </button>
      ) : null}

      {typedError ? (
        <StatusNotice tone="destructive" className="mt-3" title="Text Test Could Not Finish">
          {typedError}
        </StatusNotice>
      ) : null}

      {voiceError ? (
        <StatusNotice
          tone="destructive"
          className="mt-3"
          title="Live Voice Interrupted"
          action={
            <button
              type="button"
              onClick={() => {
                stop();
                setVoiceError("");
              }}
              aria-label="Reset Live Voice"
              className="grid h-11 w-11 place-items-center rounded-md hover:bg-secondary"
            >
              <RotateCcw size={14} />
            </button>
          }
        >
          {voiceError}
        </StatusNotice>
      ) : null}
    </section>
  );
}
