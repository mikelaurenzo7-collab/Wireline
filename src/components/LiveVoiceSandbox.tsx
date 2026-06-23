import { useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Mic, PhoneOff } from "lucide-react";
import { authFetch } from "../lib/api";

type Session = { token: string; endpoint: string; session: Record<string, unknown>; greeting: string };
type Line = { role: "You" | "Assistant"; text: string };
const RATE = 24_000;

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

function encodePcm(input: Float32Array, inputRate: number) {
  const sampled = resample(input, inputRate);
  const pcm = new Int16Array(sampled.length);
  for (let i = 0; i < sampled.length; i += 1) {
    const value = Math.max(-1, Math.min(1, sampled[i] || 0));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }
  const bytes = new Uint8Array(pcm.buffer);
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
  const nextAudio = useRef(0);
  const outputNodes = useRef(new Set<AudioBufferSourceNode>());
  const earlyAudio = useRef<string[]>([]);
  const conversationId = useRef<string | null>(null);
  const closedByUser = useRef(false);
  const retry = useRef(0);
  const pendingTools = useRef(0);

  const addDelta = (role: Line["role"], text: string) => {
    if (!text) return;
    setLines((current) => {
      const last = current[current.length - 1];
      if (last?.role === role) return [...current.slice(0, -1), { ...last, text: `${last.text}${text}` }].slice(-12);
      return [...current, { role, text }].slice(-12);
    });
  };

  const stopPlayback = () => {
    for (const node of outputNodes.current) {
      try { node.stop(); } catch { /* already stopped */ }
    }
    outputNodes.current.clear();
    nextAudio.current = 0;
  };

  const play = (encoded: string) => {
    const context = audio.current;
    if (!context) return;
    const pcm = decodePcm(encoded);
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

  const stop = () => {
    closedByUser.current = true;
    socket.current?.close();
    socket.current = null;
    stopPlayback();
    processor.current?.disconnect();
    source.current?.disconnect();
    stream.current?.getTracks().forEach((track) => track.stop());
    void audio.current?.close();
    processor.current = null;
    source.current = null;
    stream.current = null;
    audio.current = null;
    earlyAudio.current = [];
    setState("idle");
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

  const connect = async (resume = false): Promise<void> => {
    const response = await authFetch("/api/voice/live/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    const session = await response.json().catch(() => null) as Session | null;
    if (!response.ok || !session?.token || !session.endpoint) throw new Error("Live voice is unavailable for this assistant.");
    const endpoint = new URL(session.endpoint);
    if (resume && conversationId.current) endpoint.searchParams.set("conversation_id", conversationId.current);
    const ws = new WebSocket(endpoint.toString(), [`xai-client-secret.${session.token}`]);
    socket.current = ws;
    ws.onopen = () => {
      retry.current = 0;
      ws.send(JSON.stringify({ type: "session.update", session: session.session }));
      for (const audioChunk of earlyAudio.current.splice(0)) {
        ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: audioChunk }));
      }
      if (!resume && session.greeting) {
        ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "force_message", role: "assistant", interruptible: true, content: [{ type: "output_text", text: session.greeting }] } }));
      }
      setState("listening");
    };
    ws.onmessage = async (message) => {
      let event: Record<string, unknown>;
      try { event = JSON.parse(String(message.data)) as Record<string, unknown>; } catch { return; }
      const type = String(event.type || "");
      if (type === "conversation.created") {
        const value = event.conversation as { id?: unknown } | undefined;
        if (typeof value?.id === "string") conversationId.current = value.id;
      }
      if (type === "response.output_audio.delta" && typeof event.delta === "string") { play(event.delta); setState("speaking"); }
      if ((type === "response.output_audio_transcript.delta" || type === "response.output_text.delta") && typeof event.delta === "string") addDelta("Assistant", event.delta);
      if (type === "conversation.item.input_audio_transcription.updated" && typeof event.transcript === "string") addDelta("You", event.transcript);
      if (type === "input_audio_buffer.speech_started") { stopPlayback(); setState("listening"); }
      if (type === "response.done" && pendingTools.current === 0) setState("listening");
      if (type === "response.function_call_arguments.done") {
        const name = typeof event.name === "string" ? event.name : "";
        const callId = typeof event.call_id === "string" ? event.call_id : "";
        if (!name || !callId) return;
        pendingTools.current += 1;
        setState("thinking");
        let result: unknown;
        try { result = await runTool(name, typeof event.arguments === "string" ? JSON.parse(event.arguments) : {}); }
        catch (reason) { result = { error: reason instanceof Error ? reason.message : "Tool unavailable." }; }
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output: JSON.stringify(result) } }));
        pendingTools.current -= 1;
        if (pendingTools.current === 0 && ws.readyState === WebSocket.OPEN) { await waitForAudio(); ws.send(JSON.stringify({ type: "response.create" })); }
      }
      if (type === "error") {
        const detail = event.error as { message?: unknown } | undefined;
        setError(typeof detail?.message === "string" ? detail.message : "Live voice encountered an error.");
        setState("error");
      }
    };
    ws.onclose = () => {
      if (closedByUser.current) return;
      if (retry.current >= 2) { setError("Connection lost. Start the test again to continue."); setState("error"); return; }
      const delay = 500 * 2 ** retry.current++;
      window.setTimeout(() => void connect(true).catch((reason) => { setError(reason instanceof Error ? reason.message : "Could not reconnect."); setState("error"); }), delay);
    };
    ws.onerror = () => setError("The live voice connection could not be established.");
  };

  const start = async () => {
    if (state === "connecting") return;
    closedByUser.current = false;
    setError("");
    setLines([]);
    conversationId.current = null;
    earlyAudio.current = [];
    setState("connecting");
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const context = new AudioContext({ sampleRate: RATE });
      await context.resume();
      const input = context.createMediaStreamSource(mic);
      const process = context.createScriptProcessor(2048, 1, 1);
      process.onaudioprocess = (event) => {
        const payload = encodePcm(event.inputBuffer.getChannelData(0), context.sampleRate);
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
        } else if (earlyAudio.current.length < 30) {
          earlyAudio.current.push(payload);
        }
      };
      input.connect(process);
      process.connect(context.destination);
      stream.current = mic;
      audio.current = context;
      source.current = input;
      processor.current = process;
      await connect(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Microphone access is required for live voice.");
      setState("error");
    }
  };

  useEffect(() => () => stop(), []);
  const active = ["connecting", "listening", "speaking", "thinking"].includes(state);
  const label = state === "connecting" ? "Connecting" : state === "speaking" ? "Assistant speaking" : state === "thinking" ? "Checking approved knowledge" : state === "listening" ? "Listening" : "Ready for a private live test";

  return <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="wl-stitch-label">Live voice</p><h3 className="mt-1 font-display text-[20px] font-semibold tracking-[-.02em] text-foreground">Speak with {agentName}</h3><p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">A private browser test using this assistant’s rules, facts, voice profile, and pronunciation guidance.</p></div><button type="button" onClick={active ? stop : () => void start()} className={active ? "workspace-btn-secondary px-4 py-2.5" : "workspace-btn-primary px-4 py-2.5"}>{state === "connecting" ? <Loader2 size={16} className="animate-spin" /> : active ? <PhoneOff size={16} /> : <Mic size={16} />}{active ? "End live test" : "Start live test"}</button></div>
    <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary px-3 py-2.5 text-[12px] text-muted-foreground"><span className={`h-2 w-2 rounded-full ${state === "error" ? "bg-[color:var(--wl-status-error)]" : active ? "bg-[color:var(--wl-status-active)]" : "bg-muted-foreground/40"}`} /><AudioLines size={15} className="text-primary" /><span>{label}</span></div>
    <div className="mt-4 min-h-[130px] space-y-3 rounded-lg border border-border bg-secondary p-4">{lines.length ? lines.map((line, index) => <div key={`${line.role}-${index}`} className={line.role === "You" ? "ml-auto max-w-[88%] text-right" : "mr-auto max-w-[88%]"}><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{line.role === "You" ? "You" : agentName}</p><p className={`mt-1 rounded-lg px-3 py-2 text-[13px] leading-5 ${line.role === "You" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`}>{line.text}</p></div>) : <div className="grid min-h-[96px] place-items-center text-center"><p className="max-w-md text-[13px] leading-5 text-muted-foreground">Start a test, ask a real question, and interrupt naturally. This safe channel can search approved knowledge but cannot perform external actions.</p></div>}</div>
    {error ? <p className="mt-3 rounded-lg border border-[color:var(--wl-status-error)] px-3 py-2 text-[12px] text-[color:var(--wl-status-error)]">{error}</p> : null}
  </section>;
}
