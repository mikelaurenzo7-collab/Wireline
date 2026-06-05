/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LiveFloorPanel — active callers, agent availability, listen-in & whisper-coach.
 * Merged from the former /cockpit supervisor surface into Live Ops.
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Radio, Users, ShieldAlert, Activity, Headphones, Phone, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import { useAuth } from "../../contexts/AuthContext";
import { refreshSessionIfNeeded } from "../../lib/api";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { EmptyState } from "../ui/EmptyState";
import { AgentActivityIndicator } from "../ui/AgentActivityIndicator";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { WL_OPS_CLASSES, OPS_COPY, OPS_CHANNEL_EMPTY } from "../../lib/wireline-ops-design";

export type FloorCall = {
  id: string;
  agent_id?: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
  thought?: string;
};

export type FloorAgent = {
  id: string;
  name: string;
  role?: string;
};

type Props = {
  calls: FloorCall[];
  agents: FloorAgent[];
  loading?: boolean;
};

export function LiveFloorPanel({ calls, agents, loading }: Props) {
  const { info } = useToast();
  const { user } = useAuth();

  const [listeningCallId, setListeningCallId] = useState<string | null>(null);
  const [whisperingCallId, setWhisperingCallId] = useState<string | null>(null);
  const [whisperText, setWhisperText] = useState("");
  const [whisperLogs, setWhisperLogs] = useState<string[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const whisperWsRef = useRef<WebSocket | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef(0);

  const stopListening = () => {
    audioWsRef.current?.close();
    audioWsRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    analyserRef.current = null;
    setListeningCallId(null);
    setAudioLevel(0);
  };

  const startListening = async (callId: string) => {
    if (!user?.id) return;
    stopListening();
    try {
      const ok = await refreshSessionIfNeeded();
      if (!ok) return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      analyser.connect(ctx.destination);
      nextPlayTimeRef.current = ctx.currentTime;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/supervisor/stream?callId=${callId}&mode=listen`,
      );
      ws.binaryType = "arraybuffer";
      audioWsRef.current = ws;

      ws.onopen = () => setListeningCallId(callId);
      ws.onmessage = async (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        if (ctx.state === "suspended") await ctx.resume();
        const view = new DataView(event.data);
        const numSamples = event.data.byteLength / 2;
        const audioBuffer = ctx.createBuffer(1, numSamples, 8000);
        const channelData = audioBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < numSamples; i++) {
          const sample = view.getInt16(i * 2, true) / 32768;
          channelData[i] = sample;
          sum += sample * sample;
        }
        setAudioLevel(Math.sqrt(sum / numSamples));
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser);
        const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;
      };
      ws.onerror = () => {
        info("Audio stream error", "Could not connect to the live audio channel.");
        stopListening();
      };
      ws.onclose = () => setListeningCallId(null);
    } catch {
      info("Audio error", "Browser audio initialization failed.");
    }
  };

  const stopWhispering = () => {
    whisperWsRef.current?.close();
    whisperWsRef.current = null;
    setWhisperingCallId(null);
    setWhisperText("");
    setWhisperLogs([]);
  };

  const startWhispering = async (callId: string) => {
    if (!user?.id) return;
    stopWhispering();
    const ok = await refreshSessionIfNeeded();
    if (!ok) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/supervisor/stream?callId=${callId}&mode=whisper`,
    );
    whisperWsRef.current = ws;
    ws.onopen = () => {
      setWhisperingCallId(callId);
      setWhisperLogs((prev) => [...prev, "[Connected] Ready to coach agent…"]);
    };
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "whisper_delivered") {
          setWhisperLogs((prev) => [...prev, `[Delivered] ${payload.text}`]);
          info("Coaching delivered", "Note sent to the agent.");
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      info("Coaching error", "Could not connect to the coaching channel.");
      stopWhispering();
    };
    ws.onclose = () => setWhisperingCallId(null);
  };

  const sendWhisper = () => {
    if (!whisperText.trim() || !whisperWsRef.current) return;
    whisperWsRef.current.send(JSON.stringify({ type: "whisper", text: whisperText }));
    setWhisperText("");
  };

  useEffect(
    () => () => {
      audioWsRef.current?.close();
      audioContextRef.current?.close().catch(() => {});
      whisperWsRef.current?.close();
    },
    [],
  );

  const busyAgentIds = new Set(calls.map((c) => c.agent_id).filter(Boolean));
  const availableAgents = agents.filter((a) => !busyAgentIds.has(a.id));
  const escalations = calls.filter((c) => c.status === "escalated");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 min-h-0 lg:h-full">
      {/* Active callers — hero column */}
      <section className="xl:col-span-8 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
            </span>
            <h2 className="font-display italic text-lg sm:text-xl text-ink truncate">
              {OPS_COPY.floorTitle(calls.length)}
            </h2>
          </div>
          {escalations.length > 0 && (
            <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/25 text-rose-600 wl-label">
              <ShieldAlert className="w-3 h-3" aria-hidden />
              {escalations.length} escalated
            </span>
          )}
        </div>

        {loading ? (
          <ClientRouteLoading
            icon={<Radio className="w-6 h-6" />}
            label={OPS_COPY.floorLoading}
            className="min-h-[220px] wl-panel rounded-md"
          />
        ) : calls.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[220px] wl-panel rounded-md">
            <EmptyState
              icon={Radio}
              eyebrow={OPS_CHANNEL_EMPTY.floor.eyebrow}
              title={OPS_CHANNEL_EMPTY.floor.title}
              description={OPS_CHANNEL_EMPTY.floor.description}
              actions={[...OPS_CHANNEL_EMPTY.floor.actions]}
              density="compact"
              withHalo={false}
              className="py-6"
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <AnimatePresence mode="popLayout">
              {calls.map((call) => {
                const agent = agents.find((a) => a.id === call.agent_id);
                const escalated = call.status === "escalated";
                return (
                  <motion.article
                    key={call.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className={cn(
                      "transition-all duration-300",
                      escalated ? WL_OPS_CLASSES.callCardEscalated : WL_OPS_CLASSES.callCard,
                    )}
                  >
                    <div className="flex items-start gap-2.5 sm:gap-3 mb-2 sm:mb-3">
                      <div
                        className={cn(
                          "w-9 h-9 sm:w-11 sm:h-11 rounded-md flex items-center justify-center shrink-0",
                          escalated
                            ? "bg-rose-500/10 text-rose-600 border border-rose-500/20"
                            : "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20",
                        )}
                      >
                        <Phone
                          className={cn("w-4 h-4 sm:w-5 sm:h-5", escalated && "animate-pulse")}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm sm:text-base text-ink truncate">
                          {call.customer_number}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5 truncate flex items-center gap-1">
                          {call.status === "active" && (
                            <AgentActivityIndicator active size={14} pose="on-call" />
                          )}
                          {agent?.name ?? "Agent"} ·{" "}
                          <span className={escalated ? "text-rose-600" : "text-brand"}>
                            {call.sentiment_label}
                          </span>
                        </p>
                      </div>
                      {escalated && <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />}
                    </div>

                    {call.thought && (
                      <div className="mb-2 sm:mb-3 p-2.5 sm:p-3 rounded-md wl-panel">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Sparkles className="w-3 h-3 text-brand" />
                          <span className="wl-label text-muted">Live reasoning</span>
                        </div>
                        <p className="text-[11px] text-ink/75 leading-relaxed italic line-clamp-3">
                          {call.thought}
                        </p>
                      </div>
                    )}

                    <div className="mb-2 sm:mb-3">
                      <div className="flex justify-between text-[10px] text-muted mb-1">
                        <span>Urgency</span>
                        <span className="font-mono font-semibold text-ink">
                          {Math.round(call.urgency * 10)}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, call.urgency * 10)}%` }}
                          className={cn(
                            "h-full rounded-full",
                            call.urgency > 7
                              ? "bg-rose-500"
                              : "bg-gradient-to-r from-brand to-brand-deep",
                          )}
                        />
                      </div>
                    </div>

                    {listeningCallId === call.id && (
                      <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-brand/5 border border-brand/20">
                        <span className="text-[10px] font-mono text-brand animate-pulse">LIVE</span>
                        <div className="flex items-end gap-0.5 h-4 flex-1 justify-end">
                          {[140, 200, 160, 230].map((mult, i) => (
                            <div
                              key={i}
                              className="w-1 bg-brand rounded-full transition-all duration-75"
                              style={{
                                height: `${Math.min(100, Math.max(12, audioLevel * mult))}%`,
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {listeningCallId === call.id ? (
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={stopListening}
                          className="touch-press min-h-[36px] sm:min-h-[40px] rounded-md text-[10px] uppercase tracking-[0.18em] border-rose-500/30 text-rose-600 hover:bg-rose-500/10"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          Stop
                        </ShadButton>
                      ) : (
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={() => startListening(call.id)}
                          className="touch-press min-h-[36px] sm:min-h-[40px] rounded-md text-[10px] uppercase tracking-[0.18em]"
                        >
                          <Headphones className="w-3.5 h-3.5" />
                          Listen
                        </ShadButton>
                      )}
                      {whisperingCallId === call.id ? (
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={stopWhispering}
                          className="touch-press min-h-[36px] sm:min-h-[40px] rounded-md text-[10px] uppercase tracking-[0.18em] border-brand/30 text-brand hover:bg-brand/10"
                        >
                          Close coach
                        </ShadButton>
                      ) : (
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={() => startWhispering(call.id)}
                          className="touch-press min-h-[36px] sm:min-h-[40px] rounded-md text-[10px] uppercase tracking-[0.18em]"
                        >
                          <Activity className="w-3.5 h-3.5" />
                          Coach
                        </ShadButton>
                      )}
                    </div>

                    {whisperingCallId === call.id && (
                      <div className="mt-3 p-3 rounded-md border border-brand/25 bg-brand/[0.04] space-y-2">
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            value={whisperText}
                            onChange={(e) => setWhisperText(e.target.value)}
                            placeholder="Whisper to agent…"
                            className="flex-1 min-h-[40px] text-sm px-3 rounded-md bg-paper border border-black/10 focus:border-brand/40 outline-none"
                            onKeyDown={(e) => e.key === "Enter" && sendWhisper()}
                          />
                          <ShadButton
                            type="button"
                            variant="editorial"
                            size="sm"
                            disableAnimations
                            onClick={sendWhisper}
                            className="shrink-0 min-h-[40px] rounded-md text-[11px] uppercase tracking-wider"
                          >
                            Send
                          </ShadButton>
                        </div>
                        {whisperLogs.length > 0 && (
                          <div className="max-h-20 overflow-y-auto font-mono text-[10px] text-muted space-y-0.5">
                            {whisperLogs.map((line, idx) => (
                              <div key={idx} className="truncate">
                                {line}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* Agent rail — stacks below on mobile/tablet, sidebar on xl+ */}
      <aside className="xl:col-span-4 flex flex-col gap-3 min-h-0">
        <div className={WL_OPS_CLASSES.railCard}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="wl-label flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-brand" />
              Fleet
            </h3>
            <span className="text-[10px] font-mono text-muted">{agents.length} agents</span>
          </div>
          {agents.length === 0 ? (
            <EmptyState
              icon={Users}
              eyebrow={OPS_CHANNEL_EMPTY.fleetRail.eyebrow}
              title={OPS_CHANNEL_EMPTY.fleetRail.title}
              description={OPS_CHANNEL_EMPTY.fleetRail.description}
              actions={[...OPS_CHANNEL_EMPTY.fleetRail.actions]}
              density="compact"
              withHalo={false}
              className="py-4"
            />
          ) : (
            <>
              <div className="flex xl:hidden gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                {agents.map((a) => {
                  const busy = busyAgentIds.has(a.id);
                  return (
                    <span
                      key={a.id}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] border min-h-[36px]",
                        busy
                          ? "border-brand/30 bg-brand/8 text-brand"
                          : "border-black/8 bg-paper text-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          busy ? "bg-brand" : "bg-brand/40",
                        )}
                      />
                      {a.name}
                    </span>
                  );
                })}
              </div>
              <div className="hidden xl:block space-y-1.5 max-h-[220px] scroll-viewport scrollbar-hide">
                {agents.map((a) => {
                  const busy = busyAgentIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center justify-between rounded-md px-3 py-2 border text-sm",
                        busy ? "bg-brand/8 border-brand/25" : "bg-paper/60 border-black/6",
                      )}
                    >
                      <span className="text-ink truncate">{a.name}</span>
                      <span className={cn("wl-label", busy ? "text-brand" : "text-muted")}>
                        {busy ? "On call" : "Idle"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className={WL_OPS_CLASSES.railCard}>
          <h3 className="wl-label flex items-center gap-2 mb-3">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            Escalations
          </h3>
          {escalations.length === 0 ? (
            <p className="text-sm text-muted leading-relaxed">
              Nothing escalated — agents flag urgent calls automatically.
            </p>
          ) : (
            <div className="space-y-2">
              {escalations.map((e) => (
                <div key={e.id} className="rounded-md p-3 bg-rose-500/8 border border-rose-500/25">
                  <p className="font-mono text-sm text-ink">{e.customer_number}</p>
                  <p className="text-[11px] text-rose-600 mt-1">{e.sentiment_label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={cn(WL_OPS_CLASSES.railCard, "grid grid-cols-2 gap-3")}>
          <div>
            <p className="wl-label text-muted">On call</p>
            <p className="font-display italic text-2xl text-ink tabular-nums">
              {busyAgentIds.size}
            </p>
          </div>
          <div>
            <p className="wl-label text-muted">Available</p>
            <p className="font-display italic text-2xl text-ink tabular-nums">
              {availableAgents.length}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
