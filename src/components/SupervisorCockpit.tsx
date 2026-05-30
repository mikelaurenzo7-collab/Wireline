/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import { Radio, Users, PhoneCall, ShieldAlert, Loader2, Activity, Headphones } from "lucide-react";
import { authFetch, getAccessToken } from "../lib/api";
import { cn } from "../lib/utils";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

interface LiveCall {
  id: string;
  agent_id: string;
  customer_number: string;
  started_at: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
}

interface Agent {
  id: string;
  name: string;
  role: string;
  channel: string;
}

/**
 * Supervisor Cockpit — call-center monitoring surface. Aggregates the
 * live monitor's call grid with per-agent availability, queue depth,
 * and SLA flags so a floor supervisor can scan the room at a glance.
 *
 * Mounted at /cockpit and gated to Business+ tiers in nav. For tonight
 * the "listen in" button is UI-only — actual WebRTC audio streaming
 * via Vapi's assistant API is a separate slice (logged as P3 risk).
 */
export default function SupervisorCockpit() {
  const { info } = useToast();
  const { user, session } = useAuth();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const [listeningCallId, setListeningCallId] = useState<string | null>(null);
  const [whisperingCallId, setWhisperingCallId] = useState<string | null>(null);
  const [whisperText, setWhisperText] = useState("");
  const [whisperLogs, setWhisperLogs] = useState<string[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const whisperWsRef = useRef<WebSocket | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextPlayTimeRef = useRef<number>(0);

  const stopListening = () => {
    if (audioWsRef.current) {
      audioWsRef.current.close();
      audioWsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setListeningCallId(null);
    setAudioLevel(0);
  };

  const startListening = (callId: string) => {
    if (!user?.id) return;
    stopListening();

    try {
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
        `${protocol}//${window.location.host}/api/supervisor/stream?callId=${callId}&mode=listen&token=${session?.access_token}`,
      );
      ws.binaryType = "arraybuffer";
      audioWsRef.current = ws;

      ws.onopen = () => {
        setListeningCallId(callId);
      };

      ws.onmessage = async (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        if (ctx.state === "suspended") {
          await ctx.resume();
        }

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
        const rms = Math.sqrt(sum / numSamples);
        setAudioLevel(rms);

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(analyser);

        const startTime = Math.max(nextPlayTimeRef.current, ctx.currentTime);
        source.start(startTime);
        nextPlayTimeRef.current = startTime + audioBuffer.duration;
      };

      ws.onerror = () => {
        info("Audio Stream Error", "Failed to connect to real-time audio channel.");
        stopListening();
      };

      ws.onclose = () => {
        setListeningCallId(null);
      };
    } catch (_err) {
      info("Audio Error", "Browser AudioContext initialization failed.");
    }
  };

  const stopWhispering = () => {
    if (whisperWsRef.current) {
      whisperWsRef.current.close();
      whisperWsRef.current = null;
    }
    setWhisperingCallId(null);
    setWhisperText("");
    setWhisperLogs([]);
  };

  const startWhispering = (callId: string) => {
    if (!user?.id) return;
    stopWhispering();

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${protocol}//${window.location.host}/api/supervisor/stream?callId=${callId}&mode=whisper&token=${session?.access_token}`,
    );
    whisperWsRef.current = ws;

    ws.onopen = () => {
      setWhisperingCallId(callId);
      setWhisperLogs((prev) => [...prev, `[Connected] Ready to coach agent...`]);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "whisper_delivered") {
          setWhisperLogs((prev) => [...prev, `[Delivered] ${payload.text}`]);
          info("Coaching Delivered", "Note broadcasted to agent's screen.");
        }
      } catch (_err) {
        // silent parse catch
      }
    };

    ws.onerror = () => {
      info("Coaching Error", "Failed to connect to coaching backplane.");
      stopWhispering();
    };

    ws.onclose = () => {
      setWhisperingCallId(null);
    };
  };

  useEffect(() => {
    return () => {
      if (audioWsRef.current) audioWsRef.current.close();
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (whisperWsRef.current) whisperWsRef.current.close();
    };
  }, []);

  useEffect(() => {
    let alive = true;

    // Load agents once on mount — they don't change every 5 seconds
    const fetchAgents = async () => {
      try {
        const res = await authFetch("/api/agents");
        if (res.ok) {
          const d = await res.json();
          if (alive && d.agents) setAgents(d.agents);
        }
      } catch (_err) {
        // silent fetch error fallback
      }
    };
    fetchAgents();

    const pollFallbackPresence = async () => {
      try {
        const res = await authFetch("/api/fleet/presence");
        if (res.ok) {
          const d = await res.json();
          if (alive && d.signals) {
            setCalls(
              d.signals.map((s: any) => ({
                id: s.id,
                agent_id: s.agent_id || "",
                customer_number: s.customer_number || "",
                started_at: s.started_at || new Date().toISOString(),
                sentiment_label: s.label || "Connected",
                urgency: s.urgency || 0,
                status: s.status === "escalated" ? "escalated" : "active",
              })),
            );
          }
        }
      } catch {
        // fallback retry
      } finally {
        if (alive) setLoading(false);
      }
    };

    let eventSource: EventSource | null = null;
    let fallbackTimer: any = null;

    const setupPresenceStream = () => {
      try {
        const token = getAccessToken();
        if (!token) return;
        const streamUrl = `${window.location.origin}/api/fleet/presence/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(streamUrl, { withCredentials: true });

        eventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === "presence" && alive) {
              const signals = payload.signals || [];
              setCalls(
                signals.map((s: any) => ({
                  id: s.id,
                  agent_id: s.agent_id || "",
                  customer_number: s.customer_number || "",
                  started_at: s.started_at || new Date().toISOString(),
                  sentiment_label: s.label || "Connected",
                  urgency: s.urgency || 0,
                  status: s.status === "escalated" ? "escalated" : "active",
                })),
              );
              setLoading(false);
            }
          } catch (_e) {
            // parsing error
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (alive && !fallbackTimer) {
            void pollFallbackPresence();
            fallbackTimer = setInterval(pollFallbackPresence, 5000);
          }
        };
      } catch (_err) {
        void pollFallbackPresence();
        fallbackTimer = setInterval(pollFallbackPresence, 5000);
      }
    };

    setupPresenceStream();

    return () => {
      alive = false;
      if (eventSource) eventSource.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, []);

  const busyAgentIds = new Set(calls.map((c) => c.agent_id).filter(Boolean));
  const availableAgents = agents.filter((a) => !busyAgentIds.has(a.id));
  const escalations = calls.filter((c) => c.status === "escalated");

  return (
    <PageShell
      eyebrow="Floor · Supervisor"
      title="Cockpit"
      subtitle="Live agent floor — who's on a call, who's idle, what's escalated. Different from Live Ops: this view is for managing the room, not the work. Listen-in + whisper-coach in 1 tap. Refreshes every 5 seconds."
      actions={
        <div className="inline-flex items-center gap-2 px-3 h-9 rounded-full glass border border-brand/30">
          <span className="w-2 h-2 rounded-full bg-brand animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-brand">
            Live · {calls.length} active
          </span>
        </div>
      }
    >
      <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 min-h-0">
        {/* Live calls — biggest column */}
        <div className="lg:col-span-2">
          <Panel title="Active Calls" hint={`${calls.length} on the floor`} icon={Radio} scroll>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted" />
              </div>
            ) : calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Activity className="w-8 h-8 text-muted/70 mb-3" />
                <p className="text-sm text-ink/80">Floor is quiet</p>
                <p className="text-[11px] text-muted/70 mt-1 max-w-xs">
                  Live calls appear here as agents pick up. SLA flags + sentiment update in real
                  time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {calls.map((c) => {
                  const agent = agents.find((a) => a.id === c.agent_id);
                  return (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={cn(
                        "rounded-xl p-3.5 border space-y-2 transition-all duration-300",
                        c.status === "escalated"
                          ? "border-rose-500/50 bg-rose-500/5 shadow-[0_0_20px_rgba(244,63,94,0.15)]"
                          : "border-white/12 bg-white/[0.02] hover:border-white/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-sm text-ink">{c.customer_number}</p>
                        {c.status === "escalated" && (
                          <span className="text-[9px] uppercase tracking-[0.3em] text-rose-500 inline-flex items-center gap-1 animate-pulse font-semibold">
                            <ShieldAlert className="w-3 h-3" />
                            Escalated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-[0.25em] text-muted/70">
                          {agent?.name || "—"}
                        </span>
                        <span className="text-[9px] text-muted/70">·</span>
                        <span className="text-[9px] uppercase tracking-[0.25em] text-brand">
                          {c.sentiment_label}
                        </span>
                      </div>
                      {listeningCallId === c.id && (
                        <div className="flex items-center gap-1 my-2 bg-brand/5 border border-brand/20 p-2 rounded-lg">
                          <span className="text-[10px] text-brand/80 font-mono font-bold animate-pulse">
                            LIVE AUDIO:
                          </span>
                          <div className="flex items-end gap-0.5 h-4 flex-1 justify-end">
                            <div
                              className="w-1 bg-brand rounded-full transition-all duration-75"
                              style={{
                                height: `${Math.min(100, Math.max(15, audioLevel * 180))}%`,
                              }}
                            />
                            <div
                              className="w-1 bg-brand rounded-full transition-all duration-75 delay-75"
                              style={{
                                height: `${Math.min(100, Math.max(15, audioLevel * 230))}%`,
                              }}
                            />
                            <div
                              className="w-1 bg-brand rounded-full transition-all duration-75 delay-100"
                              style={{
                                height: `${Math.min(100, Math.max(15, audioLevel * 140))}%`,
                              }}
                            />
                            <div
                              className="w-1 bg-brand rounded-full transition-all duration-75 delay-150"
                              style={{
                                height: `${Math.min(100, Math.max(15, audioLevel * 200))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-1.5">
                        {listeningCallId === c.id ? (
                          <button
                            type="button"
                            onClick={() => stopListening()}
                            className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-500 hover:bg-rose-500/30 transition-all duration-300 flex items-center justify-center gap-1.5"
                          >
                            <Radio className="w-3 h-3 animate-pulse" />
                            Stop
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startListening(c.id)}
                            className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full glass border border-white/10 text-muted hover:text-brand hover:border-brand/40 hover:bg-brand/5 hover:shadow-[0_0_10px_rgba(79,30,123,0.1)] transition-all duration-300 flex items-center justify-center gap-1.5"
                          >
                            <Headphones className="w-3 h-3" />
                            Listen
                          </button>
                        )}

                        {whisperingCallId === c.id ? (
                          <button
                            type="button"
                            onClick={() => stopWhispering()}
                            className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30 transition-all duration-300 flex items-center justify-center gap-1.5"
                          >
                            <Activity className="w-3 h-3" />
                            Coach
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startWhispering(c.id)}
                            className="text-[10px] uppercase tracking-[0.24em] px-2 py-1.5 rounded-full glass border border-white/10 text-muted hover:text-violet-500 hover:border-violet-500/40 hover:bg-violet-500/5 hover:shadow-[0_0_10px_rgba(139,92,246,0.1)] transition-all duration-300 flex items-center justify-center gap-1.5"
                          >
                            <Headphones className="w-3 h-3" />
                            Whisper
                          </button>
                        )}
                      </div>

                      {whisperingCallId === c.id && (
                        <div className="mt-3 p-3 rounded-lg border border-violet-500/30 bg-violet-500/5 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-mono text-violet-400 uppercase tracking-wider">
                              Whisper Coaching
                            </span>
                            <button
                              type="button"
                              onClick={() => stopWhispering()}
                              className="text-[9px] text-muted hover:text-rose-500 uppercase font-bold"
                            >
                              Close
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={whisperText}
                              onChange={(e) => setWhisperText(e.target.value)}
                              placeholder="Type whisper note to agent..."
                              className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-ink focus:border-violet-500/50 outline-none"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  if (whisperText.trim() && whisperWsRef.current) {
                                    whisperWsRef.current.send(
                                      JSON.stringify({ type: "whisper", text: whisperText }),
                                    );
                                    setWhisperText("");
                                  }
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (whisperText.trim() && whisperWsRef.current) {
                                  whisperWsRef.current.send(
                                    JSON.stringify({ type: "whisper", text: whisperText }),
                                  );
                                  setWhisperText("");
                                }
                              }}
                              className="text-[10px] uppercase font-bold px-3 py-1.5 rounded-lg bg-violet-500 text-white hover:bg-violet-600 transition-all duration-300"
                            >
                              Send
                            </button>
                          </div>
                          {whisperLogs.length > 0 && (
                            <div className="max-h-[80px] overflow-y-auto font-mono text-[9px] text-muted/80 space-y-1 mt-1 bg-black/20 p-1.5 rounded border border-white/5">
                              {whisperLogs.map((logLine, idx) => (
                                <div key={idx} className="truncate">
                                  {logLine}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        {/* Right rail — agent availability + escalations */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel title="Available Agents" hint={`${availableAgents.length} idle`} icon={Users}>
            {agents.length === 0 ? (
              <p className="text-[11px] text-muted py-3">
                No agents in this workspace yet — head to /agents to deploy one.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {agents.map((a) => {
                  const busy = busyAgentIds.has(a.id);
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-2.5 py-1.5 border",
                        busy ? "bg-brand/8 border-brand/30" : "bg-white/[0.02] border-white/10",
                      )}
                    >
                      <span className="text-sm text-ink truncate">{a.name}</span>
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-[0.3em]",
                          busy ? "text-brand" : "text-muted/70",
                        )}
                      >
                        {busy ? "On call" : "Idle"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Escalations" hint={`${escalations.length} pending`} icon={ShieldAlert}>
            {escalations.length === 0 ? (
              <p className="text-[11px] text-muted py-3">
                Nothing in escalation right now. Agents will flag urgent calls automatically via the
                escalate-to-human tool.
              </p>
            ) : (
              <div className="space-y-1.5">
                {escalations.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg p-2.5 bg-rose-500/8 border border-rose-500/30"
                  >
                    <p className="font-mono text-sm text-ink">{e.customer_number}</p>
                    <p className="text-[10px] text-rose-500 mt-1">{e.sentiment_label}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Call Center" hint="HEALTH" icon={PhoneCall}>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">Total agents</span>
                <span className="text-ink font-mono">{agents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">On call</span>
                <span className="text-ink font-mono">{busyAgentIds.size}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Available</span>
                <span className="text-ink font-mono">{availableAgents.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Escalations</span>
                <span
                  className={cn("font-mono", escalations.length > 0 ? "text-rose-500" : "text-ink")}
                >
                  {escalations.length}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
