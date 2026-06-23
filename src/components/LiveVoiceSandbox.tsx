import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, PhoneOff, RotateCcw } from "lucide-react";
import { authFetch } from "../lib/api";

type Session = { token: string; endpoint: string; session: Record<string, unknown>; greeting: string };
type Line = { id: string; role: "You" | "Assistant"; text: string };

const RATE = 24_000;
const STREAM_CHUNK_SAMPLES = 2_400;
const MAX_BUFFERED_AUDIO_CHUNKS = 80;

function resample(input: Float32Array, inputRate: number) {
  if (inputRate === RATE) return input;
  const ratio = inputRate / RATE;
  const output = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let i = 0; i < output.length; i += 1) {
    const index = i * ratio;
    const left = Math.floor(index);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = index - left;
    output[i] = (input[left] || 0) * (1 - fraction) + (input[right] || 0) * fraction;
  }
  return output;
}

function floatToPcm(input: Float32Array, inputRate: number) {
  const sampled = resample(input, inputRate);
  const pcm = new Int16Array(sampled.length);
  for (let i = 0; i < sampled.length; i += 1) {
    const value = Math.max(-1, Math.min(1, sampled[i] || 0));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  return pcm;
}

function encodePcm(pcm: Int16Array) {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function decodePcm(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

export default function LiveVoiceSandbox({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [state, setState] = useState<"idle" | "connecting" | "listening" | "speaking" | "thinking" | "error">("idle");
  const [error, setError] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const socket = useRef<WebSocket | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const source = useRef<MediaStreamAudioSourceNode | null>(null);
  const processor = useRef<ScriptProcessorNode | null>(null);
  const mutedSink = useRef<GainNode | null>(null);
  const outputNodes = useRef(new Set<AudioBufferSourceNode>());
  const nextAudio = useRef(0);
  const pcmQueue = useRef<Int16Array[]>([]);
  const queuedSamples = useRef(0);
  const conversationId = useRef<string | null>(null);
  const closedByUser = useRef(false);
  const retry = useRef(0);
  const reconnectTimer = useRef<number | null>(null);
  const generation = useRef(0);
  const pendingTools = useRef(0);
  const assistantLineId = useRef<string | null>(null);
  const assistantTranscriptMode = useRef<"audio" | "text" | null>(null);
  const userLineId = useRef<string | null>(null);

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

  const appendAssistant = (text: string, mode: "audio" | "text") => {
    if (!text || (mode === "text" && assistantTranscriptMode.current === "audio")) return;
    if (mode === "audio") assistantTranscriptMode.current = "audio";
    if (!assistantTranscriptMode.current) assistantTranscriptMode.current = mode;
    const id = assistantLineId.current || `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    assistantLineId.current = id;
    upsertLine(id, "Assistant", text);
  };

  const updateUserTranscript = (text: string, itemId?: unknown) => {
    if (!text) return;
    const id = typeof itemId === "string" && itemId ? `user-${itemId}` : userLineId.current || `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    userLineId.current = id;
    upsertLine(id, "You", text, true);
  };

  const stopPlayback = () => {
    for (const node of outputNodes.current) {
      try { node.stop(); } catch { /* source has already stopped */ }
    }
    outputNodes.current.clear();
    nextAudio.current = 0;
  };

  const play = (encoded: string) => {
    const context = audio.current;
    if (!context) return;
    const pcm = decodePcm(encoded);
    if (!pcm.length) return;
    const buffer = context.createBuffer(1, pcm.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;
    const node = context.createBufferSource();
    node.buffer = buffer;
    node.connect(context.destination);
    const start = Math.max(context.currentTime + 0.02, nextAudio.current);
    nextAudio.current = start + buffer.duration;
    outputNodes.current.add(node);
    node.onended = () => outputNodes.current.delete(node);
    node.start(start);
  };

  const waitForAudio = () => new Promise<void>((resolve) => {
    const context = audio.current;
    const delay = context ? Math.max(20, (nextAudio.current - context.currentTime) * 1000 + 30) : 20;
    window.setTimeout(resolve, delay);
  });

  const flushAudio = () => {
    const ws = socket.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (queuedSamples.current >= STREAM_CHUNK_SAMPLES) {
      const payload = new Int16Array(STREAM_CHUNK_SAMPLES);
      let writeOffset = 0;
      while (writeOffset < STREAM_CHUNK_SAMPLES && pcmQueue.current.length) {
        const chunk = pcmQueue.current[0];
        const take = Math.min(STREAM_CHUNK_SAMPLES - writeOffset, chunk.length);
        payload.set(chunk.subarray(0, take), writeOffset);
        writeOffset += take;
        if (take === chunk.length) pcmQueue.current.shift();
        else pcmQueue.current[0] = chunk.subarray(take);
      }
      queuedSamples.current -= STREAM_CHUNK_SAMPLES;
      ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: encodePcm(payload) }));
    }
  };

  const queueMicrophoneAudio = (input: Float32Array, inputRate: number) => {
    const pcm = floatToPcm(input, inputRate);
    if (!pcm.length) return;
    if (pcmQueue.current.length >= MAX_BUFFERED_AUDIO_CHUNKS) {
      const dropped = pcmQueue.current.shift();
      if (dropped) queuedSamples.current -= dropped.length;
    }
    pcmQueue.current.push(pcm);
    queuedSamples.current += pcm.length;
    flushAudio();
  };

  const releaseMedia = () => {
    stopPlayback();
    processor.current?.disconnect();
    source.current?.disconnect();
    mutedSink.current?.disconnect();
    stream.current?.getTracks().forEach((track) => track.stop());
    void audio.current?.close();
    processor.current = null;
    source.current = null;
    mutedSink.current = null;
    stream.current = null;
    audio.current = null;
    pcmQueue.current = [];
    queuedSamples.current = 0;
  };

  const stop = () => {
    generation.current += 1;
    closedByUser.current = true;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    socket.current?.close();
    socket.current = null;
    releaseMedia();
    pendingTools.current = 0;
    userLineId.current = null;
    assistantLineId.current = null;
    assistantTranscriptMode.current = null;
    setState("idle");
  };

  const fail = (message: string) => {
    generation.current += 1;
    closedByUser.current = true;
    if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
    reconnectTimer.current = null;
    socket.current?.close();
    socket.current = null;
    releaseMedia();
    pendingTools.current = 0;
    setError(message);
    setState("error");
  };

  const runTool = async (name: string, args: unknown) => {
    const response = await authFetch("/api/voice/live/tool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId, name, arguments: args }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Approved knowledge is unavailable.");
    return body?.result || {};
  };

  const connect = async (resume: boolean, connectionGeneration: number): Promise<void> => {
    if (connectionGeneration !== generation.current || closedByUser.current) return;
    if (resume) { setState("connecting"); setError(""); }
    const response = await authFetch("/api/voice/live/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    const session = await response.json().catch(() => null) as Session | null;
    if (!response.ok || !session?.token || !session.endpoint) throw new Error("Live voice is unavailable for this assistant.");
    if (connectionGeneration !== generation.current || closedByUser.current) return;
    const endpoint = new URL(session.endpoint);
    if (resume && conversationId.current) endpoint.searchParams.set("conversation_id", conversationId.current);
    const ws = new WebSocket(endpoint.toString(), [`xai-client-secret.${session.token}`]);
    socket.current = ws;

    ws.onopen = () => {
      if (connectionGeneration !== generation.current || closedByUser.current) { ws.close(); return; }
      retry.current = 0;
      ws.send(JSON.stringify({ type: "session.update", session: session.session }));
      flushAudio();
      if (!resume && session.greeting) {
        ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", interruptible: true, content: [{ type: "output_text", text: session.greeting }] } }));
      }
      setState("listening");
    };

    ws.onmessage = async (message) => {
      if (connectionGeneration !== generation.current) return;
      let event: Record<string, unknown>;
      try { event = JSON.parse(String(message.data)) as Record<string, unknown>; } catch { return; }
      const type = String(event.type || "");
      if (type === "conversation.created") {
        const conversation = event.conversation as { id?: unknown } | undefined;
        if (typeof conversation?.id === "string") conversationId.current = conversation.id;
      }
      if (type === "response.output_audio.delta" && typeof event.delta === "string") { play(event.delta); setState("speaking"); }
      if (type === "response.output_audio_transcript.delta" && typeof event.delta === "string") appendAssistant(event.delta, "audio");
      if (type === "response.output_text.delta" && typeof event.delta === "string") appendAssistant(event.delta, "text");
      if (type === "conversation.item.input_audio_transcription.updated") {
        updateUserTranscript(typeof event.transcript === "string" ? event.transcript : "", event.item_id);
      }
      if (type === "input_audio_buffer.speech_started") { stopPlayback(); setState("listening"); }
      if (type === "response.done") {
        assistantLineId.current = null;
        assistantTranscriptMode.current = null;
        userLineId.current = null;
        if (!pendingTools.current) setState("listening");
      }
      if (type === "response.function_call_arguments.done") {
        const name = typeof event.name === "string" ? event.name : "";
        const callId = typeof event.call_id === "string" ? event.call_id : "";
        if (!name || !callId) return;
        pendingTools.current += 1;
        setState("thinking");
        let result: unknown;
        try { result = await runTool(name, typeof event.arguments === "string" ? JSON.parse(event.arguments) : {}); }
        catch (reason) { result = { error: reason instanceof Error ? reason.message : "Tool unavailable." }; }
        if (ws.readyState === WebSocket.OPEN && connectionGeneration === generation.current) {
          ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
        }
        pendingTools.current -= 1;
        if (!pendingTools.current && ws.readyState === WebSocket.OPEN && connectionGeneration === generation.current) {
          await waitForAudio();
          if (ws.readyState === WebSocket.OPEN && connectionGeneration === generation.current) ws.send(JSON.stringify({ type: "response.create" }));
        }
      }
      if (type === "error") {
        const detail = event.error as { message?: unknown } | undefined;
        fail(typeof detail?.message === "string" ? detail.message : "Live voice encountered an error.");
      }
    };

    ws.onclose = () => {
      if (connectionGeneration !== generation.current || closedByUser.current) return;
      if (retry.current >= 2) { fail("Connection lost. Start the test again to continue."); return; }
      const delay = 500 * 2 ** retry.current++;
      reconnectTimer.current = window.setTimeout(() => {
        void connect(true, connectionGeneration).catch((reason) => {
          if (connectionGeneration === generation.current) fail(reason instanceof Error ? reason.message : "Could not reconnect live voice.");
        });
      }, delay);
    };

    ws.onerror = () => {
      if (connectionGeneration === generation.current && !closedByUser.current) setError("The live voice connection was interrupted. Reconnecting…");
    };
  };

  const start = async () => {
    if (state === "connecting" || ["listening", "speaking", "thinking"].includes(state)) return;
    stop();
    const connectionGeneration = generation.current;
    closedByUser.current = false;
    setError("");
    setLines([]);
    conversationId.current = null;
    retry.current = 0;
    setState("connecting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (connectionGeneration !== generation.current || closedByUser.current) { mic.getTracks().forEach((track) => track.stop()); return; }
      const context = new AudioContext({ sampleRate: RATE });
      await context.resume();
      const input = context.createMediaStreamSource(mic);
      const process = context.createScriptProcessor(2048, 1, 1);
      const sink = context.createGain();
      sink.gain.value = 0;
      process.onaudioprocess = (event) => queueMicrophoneAudio(event.inputBuffer.getChannelData(0), context.sampleRate);
      input.connect(process);
      process.connect(sink);
      sink.connect(context.destination);
      stream.current = mic;
      audio.current = context;
      source.current = input;
      processor.current = process;
      mutedSink.current = sink;
      await connect(false, connectionGeneration);
    } catch (reason) {
      if (connectionGeneration === generation.current) fail(reason instanceof Error ? reason.message : "Microphone access is required for live voice.");
    }
  };

  useEffect(() => () => stop(), []);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);
  const label = state === "connecting" ? "Connecting" : state === "speaking" ? "Assistant speaking" : state === "thinking" ? "Checking approved knowledge" : state === "listening" ? "Listening" : "Ready for a private live test";

  return <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="wl-stitch-label">Live voice</p><h3 className="mt-1 font-display text-[20px] font-semibold tracking-[-.02em] text-foreground">Speak with {agentName}</h3><p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">A private browser test using this assistant’s rules, facts, voice profile, and pronunciation guidance.</p></div><button type="button" onClick={active ? stop : () => void start()} className={active ? "workspace-btn-secondary px-4 py-2.5" : "workspace-btn-primary px-4 py-2.5"}>{state === "connecting" ? <Loader2 size={16} className="animate-spin" /> : active ? <PhoneOff size={16} /> : <Mic size={16} />}{active ? "End live test" : "Start live test"}</button></div>
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5 text-[12px] text-muted-foreground"><span className={`h-2 w-2 rounded-full ${state === "error" ? "bg-[color:var(--wl-status-error)]" : active ? "bg-[color:var(--wl-status-active)]" : "bg-muted-foreground/40"}`} /><AudioLines size={15} className="text-primary" /><span>{label}</span></div>
    <div className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4">{lines.length ? lines.map((line) => <div key={line.id} className={line.role === "You" ? "ml-auto max-w-[88%] text-right" : "mr-auto max-w-[88%]"}><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{line.role === "You" ? "You" : agentName}</p><p className={`mt-1 rounded-lg px-3 py-2 text-[13px] leading-5 ${line.role === "You" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`}>{line.text}</p></div>) : <div className="grid min-h-[96px] place-items-center text-center"><p className="max-w-md text-[13px] leading-5 text-muted-foreground">Start a test, ask a real question, and interrupt naturally. This safe channel can search approved knowledge but cannot perform external actions.</p></div>}</div>
    {error ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[color:var(--wl-status-error)] px-3 py-2 text-[12px] text-[color:var(--wl-status-error)]"><span>{error}</span><button type="button" onClick={() => { setError(""); setState("idle"); }} aria-label="Reset live voice" className="grid h-7 w-7 place-items-center rounded-md hover:bg-secondary"><RotateCcw size={14} /></button></div> : null}
  </section>;
}
