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
import {
  PhoneCall,
  Brain,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
} from "lucide-react";
import { PageMeta } from "../lib/page-meta";
import MarketingChrome from "./marketing/MarketingChrome";

type ComponentState = "operational" | "degraded" | "outage" | "unknown";
type OverallState = "operational" | "degraded" | "outage" | "unknown";

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
  {
    label: string;
    toneColor: string;
    pillStyle: React.CSSProperties;
    gradientStyle: React.CSSProperties;
    icon: typeof CheckCircle2;
  }
> = {
  operational: {
    label: "Operational",
    toneColor: "#047857",
    pillStyle: {
      background: "rgba(16,185,129,0.10)",
      color: "#047857",
      border: "1px solid rgba(16,185,129,0.25)",
    },
    gradientStyle: {
      background:
        "linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(16,185,129,0.04) 50%, transparent 100%)",
    },
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    toneColor: "#b45309",
    pillStyle: {
      background: "rgba(245,158,11,0.10)",
      color: "#b45309",
      border: "1px solid rgba(245,158,11,0.25)",
    },
    gradientStyle: {
      background:
        "linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.04) 50%, transparent 100%)",
    },
    icon: AlertTriangle,
  },
  outage: {
    label: "Outage",
    toneColor: "#be123c",
    pillStyle: {
      background: "rgba(232,70,106,0.10)",
      color: "#be123c",
      border: "1px solid rgba(232,70,106,0.25)",
    },
    gradientStyle: {
      background:
        "linear-gradient(135deg, rgba(232,70,106,0.08) 0%, rgba(232,70,106,0.04) 50%, transparent 100%)",
    },
    icon: XCircle,
  },
  unknown: {
    label: "Unknown",
    toneColor: "var(--color-muted)",
    pillStyle: {},
    gradientStyle: {},
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
      } catch (_err) {
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

  const overall: OverallState = data?.overall ?? (error ? "unknown" : "operational");
  const OverallIcon = STATE_META[overall].icon;

  return (
    <>
      <PageMeta
        title="System Status — Wireline"
        description="Live operational status of Wireline's voice runtime, fallback path, and reasoning layer. Updated every 60 seconds."
        path="/status"
      />
      <MarketingChrome stickyCta={false}>
        <div className="scanline pointer-events-none fixed inset-0 z-0 opacity-30" aria-hidden />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
          {/* Overall status card */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="marketing-panel p-6 sm:p-8 mb-6 relative overflow-hidden"
            data-testid="status-overall"
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={STATE_META[overall].gradientStyle}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="hero-accent-line" style={{ background: "#8B3FD6" }} />
                <span className="text-eyebrow">Live system status</span>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
                  style={STATE_META[overall].pillStyle}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <OverallIcon className="w-6 h-6" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="marketing-hero-title text-3xl sm:text-4xl mb-1">
                    {loading
                      ? "Checking…"
                      : overall === "operational"
                        ? "All systems operational"
                        : overall === "degraded"
                          ? "Some systems degraded"
                          : overall === "outage"
                            ? "Outage in progress"
                            : "Status temporarily unavailable"}
                  </h1>
                  <p className="marketing-body">
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
                    ) : error ? (
                      "We could not reach the public status feed. This is not treated as a service outage until a live probe confirms one."
                    ) : (
                      "Probing the live runtime…"
                    )}
                  </p>
                  {error && <p className="mt-2 text-[11px] text-muted">{error}</p>}
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
                    className="marketing-panel p-4 relative overflow-hidden"
                    data-testid={`status-component-${key}`}
                  >
                    <div
                      aria-hidden="true"
                      className="absolute inset-0 pointer-events-none"
                      style={stateMeta.gradientStyle}
                    />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-2.5">
                        <Icon className="w-4 h-4 text-ink/75" strokeWidth={1.75} />
                        <span
                          className="inline-flex items-center gap-1 text-[8.5px] uppercase tracking-[0.22em] font-semibold px-2 py-0.5 rounded-full leading-none"
                          style={stateMeta.pillStyle}
                        >
                          <StateIcon className="w-2.5 h-2.5" />
                          {stateMeta.label}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-ink mb-1">{meta.label}</p>
                      <p className="text-caption leading-relaxed">{meta.description}</p>
                    </div>
                  </motion.div>
                );
              },
            )}
          </div>

          {/* Reassurance footer */}
          <div className="marketing-panel-muted p-4 sm:p-5">
            <p className="text-eyebrow mb-2">How we measure</p>
            <p className="marketing-body">
              Every 60 seconds, Wireline pings each production LLM tier with a 1-token probe.
              Operational means the model responded within timeout. Degraded means the layer is
              unconfigured or partially available. Outage means the layer is failing. We never
              store, log, or render the content of these probes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9.5px] uppercase tracking-[0.32em] text-muted/70">
              <span>Probe interval · 60s</span>
              <span className="text-muted/70">·</span>
              <span>Public cache · 60s</span>
              <span className="text-muted/70">·</span>
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
        </div>
      </MarketingChrome>
    </>
  );
}
