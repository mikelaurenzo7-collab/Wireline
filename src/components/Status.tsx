import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  { label: string; tone: string; pill: string; bgGradient: string; icon: typeof CheckCircle2 }
> = {
  operational: {
    label: "Operational",
    tone: "text-brand",
    pill: "bg-brand/10 text-brand border-brand/25",
    bgGradient: "from-brand/8 via-brand/4 to-transparent",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    tone: "text-[var(--wireline-color-status-warning)]",
    pill: "bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)] border-[var(--wireline-color-feedback-warning-border)]",
    bgGradient:
      "from-[color-mix(in_srgb,var(--wireline-color-status-warning)_8%,transparent)] via-[color-mix(in_srgb,var(--wireline-color-status-warning)_4%,transparent)] to-transparent",
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

function presentationState(
  data: PublicHealth | null,
  loading: boolean,
  error: string | null,
): OverallState {
  if (loading && !data) return "unknown";
  if (!data) return error ? "unknown" : "operational";

  /*
   * The public feed currently uses model probes. Those probes can reject a
   * model while Wireline's configured fallback remains available. Avoid
   * claiming a complete customer outage until an end-to-end monitor confirms
   * no serving path is available.
   */
  if (data.overall === "outage" && data.components.voice_fallback === "operational") {
    return "degraded";
  }
  return data.overall;
}

export default function Status() {
  const [data, setData] = useState<PublicHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/health/public", { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as PublicHealth;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (_err) {
        if (!cancelled) setError("Status feed temporarily unavailable.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchHealth();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchHealth();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const overall = presentationState(data, loading, error);
  const OverallIcon = STATE_META[overall].icon;
  const fallbackCovering =
    data?.overall === "outage" && data.components.voice_fallback === "operational";

  return (
    <>
      <PageMeta
        title="System Status — Wireline"
        description="Live operational status of Wireline's voice runtime, fallback path, and reasoning layer. Updated every 60 seconds."
        path="/status"
      />
      <MarketingChrome stickyCta={false}>
        <div className="relative z-10 mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="marketing-panel relative mb-6 overflow-hidden p-6 sm:p-8"
            data-testid="status-overall"
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${STATE_META[overall].bgGradient}`}
            />
            <div className="relative">
              <div className="mb-3 flex items-center gap-2">
                <span className="hero-accent-line bg-brand" />
                <span className="text-eyebrow">Live system status</span>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${STATE_META[overall].pill}`}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <OverallIcon className="h-6 w-6" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="marketing-hero-title mb-1 text-3xl sm:text-4xl">
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
                  {fallbackCovering ? (
                    <p className="mt-2 text-[var(--wireline-typography-overline-size)] leading-5 text-muted">
                      A primary model probe is unavailable; Wireline&apos;s configured fallback
                      remains available.
                    </p>
                  ) : null}
                  {error ? (
                    <p className="mt-2 text-[var(--wireline-typography-overline-size)] text-muted">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="mb-8 grid gap-3 sm:grid-cols-3">
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
                    className="marketing-panel relative overflow-hidden p-4"
                    data-testid={`status-component-${key}`}
                  >
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stateMeta.bgGradient}`}
                    />
                    <div className="relative">
                      <div className="mb-2.5 flex items-center justify-between">
                        <Icon className="h-4 w-4 text-foreground/75" strokeWidth={1.75} />
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[var(--wireline-typography-overline-size)] font-semibold uppercase leading-none tracking-[0.22em] ${stateMeta.pill}`}
                        >
                          <StateIcon className="h-2.5 w-2.5" />
                          {stateMeta.label}
                        </span>
                      </div>
                      <p className="mb-1 text-sm font-semibold text-foreground">{meta.label}</p>
                      <p className="text-caption leading-relaxed">{meta.description}</p>
                    </div>
                  </motion.div>
                );
              },
            )}
          </div>

          <div className="marketing-panel-muted p-4 sm:p-5">
            <p className="text-eyebrow mb-2">How we measure</p>
            <p className="marketing-body">
              Every 60 seconds, Wireline pings each production LLM tier with a 1-token probe.
              Operational means the model responded within timeout. Degraded means a layer is
              partially available or a fallback is covering a primary probe. Outage is reserved for
              a confirmed lack of serving paths. We never store, log, or render the content of these
              probes.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.32em] text-muted/70">
              <span>Probe interval · 60s</span>
              <span className="text-muted/70">·</span>
              <span>Public cache · 60s</span>
              <span className="text-muted/70">·</span>
              <Link to="/security" className="transition-colors hover:text-foreground">
                Security practices
              </Link>
              <span className="text-muted/70">·</span>
              <a
                href="https://twitter.com/intent/tweet?text=%40trywireline+status"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-foreground"
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
