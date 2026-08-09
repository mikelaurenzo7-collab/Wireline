import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import {
  PhoneCall,
  Brain,
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

const COMPONENT_META = {
  voice_runtime: {
    label: "Managed voice access",
    icon: PhoneCall,
  },
  reasoning: {
    label: "Reasoning model access",
    icon: Brain,
  },
} satisfies Partial<
  Record<
    keyof PublicHealth["components"],
    { label: string; icon: typeof PhoneCall }
  >
>;

const STATUS_REFRESH_MS = 60_000;

const STATE_META: Record<
  ComponentState | OverallState,
  {
    label: string;
    tone: string;
    pill: string;
    bgGradient: string;
    icon: typeof CheckCircle2;
  }
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
): OverallState {
  if (loading && !data) return "unknown";
  return data?.overall ?? "unknown";
}

const STATES: readonly OverallState[] = [
  "operational",
  "degraded",
  "outage",
  "unknown",
];
const isState = (value: unknown): value is ComponentState =>
  typeof value === "string" && (STATES as readonly string[]).includes(value);

/**
 * The feed is a network payload, so it is narrowed at the boundary rather than
 * asserted through a cast. A 200 whose body does not carry a recognised
 * `overall` used to index `STATE_META` with `undefined` and throw while reading
 * `.icon`, taking down the whole page — on the one public surface whose entire
 * job is to still be standing when something else is not. Deploy skew, a proxy
 * interstitial, or a future field rename are all enough to produce that body.
 *
 * Anything unrecognised now reads as "unknown", which the page already renders,
 * and a body with no usable component map degrades instead of crashing.
 */
function normalizeHealth(payload: unknown): PublicHealth | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  const components: Record<string, unknown> =
    raw.components && typeof raw.components === "object"
      ? (raw.components as Record<string, unknown>)
      : {};
  return {
    overall: isState(raw.overall) ? raw.overall : "unknown",
    components: {
      voice_runtime: isState(components.voice_runtime)
        ? components.voice_runtime
        : "unknown",
      voice_fallback: isState(components.voice_fallback)
        ? components.voice_fallback
        : "unknown",
      reasoning: isState(components.reasoning)
        ? components.reasoning
        : "unknown",
    },
    last_checked: typeof raw.last_checked === "string" ? raw.last_checked : "",
  };
}

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
          // The server already owns a bounded distributed probe cache. Do not let
          // the browser retain an older degraded payload across later 60s polls.
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = normalizeHealth(await res.json());
        if (!json) throw new Error("Unrecognised status payload");
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
    }, STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const overall = presentationState(data, loading);
  const OverallIcon = STATE_META[overall].icon;

  return (
    <>
      <PageMeta
        title="Provider Status | Wireline"
        description="Live access checks for Wireline's managed voice control plane and reasoning model. Updated every 60 seconds."
        path="/status"
      />
      <MarketingChrome stickyCta={false}>
        <div className="relative z-10 mx-auto max-w-4xl px-5 py-8 sm:px-6 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="marketing-panel relative mb-6 overflow-hidden p-6 text-center sm:p-8"
            data-testid="status-overall"
          >
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${STATE_META[overall].bgGradient}`}
            />
            <div className="relative">
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${STATE_META[overall].pill}`}
                >
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <OverallIcon className="h-6 w-6" strokeWidth={1.75} />
                  )}
                </div>
                <div className="min-w-0 max-w-2xl flex-1 text-center">
                  <h1 className="marketing-hero-title mb-1 text-3xl sm:text-4xl">
                    {loading
                      ? "Checking…"
                      : overall === "operational"
                        ? "Provider checks operational"
                        : overall === "degraded"
                          ? "Provider checks degraded"
                          : overall === "outage"
                            ? "Provider check failed"
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
                  {error ? (
                    <p className="mt-2 text-[length:var(--wireline-typography-overline-size)] text-muted">
                      {error}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </motion.div>

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {(
              Object.keys(COMPONENT_META) as Array<keyof typeof COMPONENT_META>
            ).map((key, idx) => {
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
                      <Icon
                        className="h-4 w-4 text-foreground/75"
                        strokeWidth={1.75}
                      />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--wireline-typography-overline-size)] font-semibold uppercase leading-none tracking-[0.22em] ${stateMeta.pill}`}
                      >
                        <StateIcon className="h-2.5 w-2.5" />
                        {stateMeta.label}
                      </span>
                    </div>
                    <p className="mb-1 text-sm font-semibold text-foreground">
                      {meta.label}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          <div className="marketing-panel-muted p-4 sm:p-5">
            <p className="text-eyebrow mb-2">How we measure</p>
            <p className="marketing-body">
              Every 60 seconds, Wireline checks managed voice control-plane
              access and OpenAI model access without placing a call or
              generating content. These checks confirm provider reachability and
              credential access—not an end-to-end customer call. The cards above
              show which check needs attention.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.32em] text-muted/70">
              <span>Probe interval · 60s</span>
              <span className="text-muted/70">·</span>
              <span>Public cache · 60s</span>
              <span className="text-muted/70">·</span>
              <Link
                to="/security"
                className="transition-colors hover:text-foreground"
              >
                Security practices
              </Link>
              <span className="text-muted/70">·</span>
              <Link
                to="/support"
                className="transition-colors hover:text-foreground"
              >
                Report an issue
              </Link>
            </div>
          </div>
        </div>
      </MarketingChrome>
    </>
  );
}
