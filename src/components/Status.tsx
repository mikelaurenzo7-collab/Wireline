/**
 * Status.tsx — Public uptime + service-health page at /status.
 *
 * Why this exists:
 *   B2B prospects in 2026 expect a public status page. Its absence
 *   reads as "this is a side project." Its presence reads as "this is
 *   a real company that runs a real shop." Single highest-leverage
 *   trust signal per LOC.
 *
 * Data source: GET /api/health/public — no auth, 60s server-side cache.
 *   Returns { overall, components: { voice_runtime, voice_fallback,
 *   reasoning }, last_checked, next_check_at }
 *
 * Polling: every 30s while the tab is visible. Pauses when hidden so
 * the page costs us nothing when nobody's looking.
 *
 * Mobile-first: single-column stack under sm, 3-column at md+.
 */
import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import {
  PhoneCall,
  Brain,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import WirelineMark from "./WirelineMark";
import { PageMeta } from "../lib/page-meta";

type ComponentState = "operational" | "degraded" | "outage" | "unknown";
type OverallState = "operational" | "degraded" | "outage";

interface PublicHealth {
  overall: OverallState;
  components: {
    voice_runtime: ComponentState;
    voice_fallback: ComponentState;
    reasoning: ComponentState;
  };
  last_checked: string;
}

const COMPONENT_META: Record<
  keyof PublicHealth["components"],
  { label: string; description: string; icon: typeof PhoneCall }
> = {
  voice_runtime: {
    label: "Voice runtime",
    description: "Live phone calls, in-the-wire speech-to-text + reply",
    icon: PhoneCall,
  },
  voice_fallback: {
    label: "Voice fallback",
    description: "Secondary voice path that engages during primary outages",
    icon: ShieldCheck,
  },
  reasoning: {
    label: "Reasoning layer",
    description: "Pre-call briefs, post-call analysis, daily intelligence",
    icon: Brain,
  },
};

const STATE_META: Record<
  ComponentState | OverallState,
  { label: string; tone: string; pill: string; bgGradient: string; icon: typeof CheckCircle2 }
> = {
  operational: {
    label: "Operational",
    tone: "text-emerald-700",
    pill: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25",
    bgGradient: "from-emerald-500/8 via-emerald-500/4 to-transparent",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    tone: "text-amber-700",
    pill: "bg-amber-500/10 text-amber-700 border-amber-500/25",
    bgGradient: "from-amber-500/8 via-amber-500/4 to-transparent",
    icon: AlertTriangle,
  },
  outage: {
    label: "Outage",
    tone: "text-rose-700",
    pill: "bg-rose-500/10 text-rose-700 border-rose-500/25",
    bgGradient: "from-rose-500/8 via-rose-500/4 to-transparent",
    icon: XCircle,
  },
  unknown: {
    label: "Unknown",
    tone: "text-muted",
    pill: "bg-muted/10 text-muted border-muted/25",
    bgGradient: "from-muted/8 via-muted/4 to-transparent",
    icon: AlertTriangle,
  },
};

export default function Status() {
  const [data, setData] = useState<PublicHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/health/public", {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicHealth;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Status feed temporarily unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHealth();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") fetchHealth();
    }, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const overall = data?.overall ?? (error ? "outage" : "operational");
  const OverallIcon = STATE_META[overall].icon;

  return (
    <>
      <PageMeta
        title="System Status — Wireline"
        description="Live operational status of Wireline's voice runtime, fallback path, and reasoning layer. Updated every 60 seconds."
        path="/status"
      />
      <div className="min-h-dvh bg-paper relative">
        <div className="scanline" />

        {/* Header strip — minimal, mirrors the marketing chrome */}
        <header className="border-b border-black/5 bg-white/60 backdrop-blur sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5 group" aria-label="Wireline home">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "#4F1E7B" }}
              >
                <WirelineMark className="w-4 h-4 text-on-brand" strokeWidth={130} />
              </div>
              <span className="brand-wordmark text-[15px] leading-none !text-[#4F1E7B] !filter-none">
                WIRELINE
              </span>
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em] text-muted hover:text-ink transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              Back home
            </Link>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          {/* Overall status card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-black/8 bg-white p-6 sm:p-8 mb-6 relative overflow-hidden"
            data-testid="status-overall"
          >
            <div
              aria-hidden="true"
              className={`absolute inset-0 bg-gradient-to-br ${STATE_META[overall].bgGradient} pointer-events-none`}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="hero-accent-line" style={{ background: "#4F1E7B" }} />
                <span className="text-[8.5px] uppercase tracking-[0.5em] text-muted/65 font-semibold">
                  Live system status
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${STATE_META[overall].pill}`}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <OverallIcon className="w-6 h-6" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="font-display italic text-3xl sm:text-4xl text-ink leading-tight tracking-tight mb-1">
                    {loading
                      ? "Checking…"
                      : overall === "operational"
                        ? "All systems operational"
                        : overall === "degraded"
                          ? "Some systems degraded"
                          : "Outage in progress"}
                  </h1>
                  <p className="text-[12px] text-muted/80 leading-relaxed">
                    {data?.last_checked ? (
                      <>
                        Last checked{" "}
                        <time dateTime={data.last_checked}>
                          {new Date(data.last_checked).toLocaleString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                            month: "short",
                            day: "numeric",
                            timeZoneName: "short",
                          })}
                        </time>{" "}
                        · refreshes every 60s.
                      </>
                    ) : (
                      "Probing the live runtime…"
                    )}
                  </p>
                  {error && <p className="mt-2 text-[11px] text-rose-700">{error}</p>}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Component grid */}
          <div className="grid sm:grid-cols-3 gap-3 mb-8">
            {(Object.keys(COMPONENT_META) as Array<keyof PublicHealth["components"]>).map(
              (key, idx) => {
                const meta = COMPONENT_META[key];
                const state = data?.components[key] ?? "unknown";
                const stateMeta = STATE_META[state];
                const Icon = meta.icon;
                const StateIcon = stateMeta.icon;
                return (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 + idx * 0.05 }}
                    className="rounded-xl border border-black/8 bg-white p-4 relative overflow-hidden"
                    data-testid={`status-component-${key}`}
                  >
                    <div
                      aria-hidden="true"
                      className={`absolute inset-0 bg-gradient-to-br ${stateMeta.bgGradient} pointer-events-none`}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-2.5">
                        <Icon className="w-4 h-4 text-ink/75" strokeWidth={1.75} />
                        <span
                          className={`inline-flex items-center gap-1 text-[8.5px] uppercase tracking-[0.22em] font-semibold px-2 py-0.5 rounded-full border leading-none ${stateMeta.pill}`}
                        >
                          <StateIcon className="w-2.5 h-2.5" />
                          {stateMeta.label}
                        </span>
                      </div>
                      <p className="text-[13px] font-semibold text-ink mb-1">{meta.label}</p>
                      <p className="text-[10.5px] text-muted/70 leading-relaxed">
                        {meta.description}
                      </p>
                    </div>
                  </motion.div>
                );
              },
            )}
          </div>

          {/* Reassurance footer */}
          <div className="rounded-xl border border-black/8 bg-white/70 p-4 sm:p-5">
            <p className="text-[8.5px] uppercase tracking-[0.5em] text-muted/65 font-semibold mb-2">
              How we measure
            </p>
            <p className="text-[12.5px] text-ink/85 leading-relaxed">
              Every 60 seconds, Wireline pings each production LLM tier with a 1-token probe.
              Operational means the model responded within timeout. Degraded means the layer is
              unconfigured or partially available. Outage means the layer is failing. We never
              store, log, or render the content of these probes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9.5px] uppercase tracking-[0.32em] text-muted/65">
              <span>Probe interval · 60s</span>
              <span className="text-muted/30">·</span>
              <span>Public cache · 60s</span>
              <span className="text-muted/30">·</span>
              <a
                href="https://twitter.com/intent/tweet?text=%40trywireline+status"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink transition-colors"
              >
                Report an issue
              </a>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
