import React, { useEffect, useState } from "react";
import { Link } from "react-router";
import { PhoneCall, Brain, CheckCircle2, AlertTriangle, XCircle, Loader2, ChevronDown } from "lucide-react";
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
    label: "Managed call access",
    detail: "Phone runtime",
    icon: PhoneCall,
  },
  reasoning: {
    label: "Reasoning model access",
    detail: "Managed inference",
    icon: Brain,
  },
} satisfies Partial<
  Record<keyof PublicHealth["components"], { label: string; detail: string; icon: typeof PhoneCall }>
>;

const STATUS_REFRESH_MS = 60_000;
/** Comfortably under the refresh interval so polls can never pile up. */
const STATUS_FETCH_TIMEOUT_MS = 15_000;

const STATE_META: Record<
  ComponentState | OverallState,
  {
    label: string;
    tone: string;
    pill: string;
    icon: typeof CheckCircle2;
  }
> = {
  operational: {
    label: "Operational",
    tone: "text-[var(--wireline-color-status-success)]",
    pill: "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]",
    icon: CheckCircle2,
  },
  degraded: {
    label: "Degraded",
    tone: "text-[var(--wireline-color-status-warning)]",
    pill: "border-[var(--wireline-color-feedback-warning-border)] bg-[var(--wireline-color-feedback-warning-surface)] text-[var(--wireline-color-status-warning)]",
    icon: AlertTriangle,
  },
  outage: {
    label: "Outage",
    tone: "text-[var(--wireline-color-status-error)]",
    pill: "border-[color:color-mix(in_srgb,var(--wireline-color-status-error)_28%,var(--wireline-color-border-default))] bg-[color:color-mix(in_srgb,var(--wireline-color-status-error)_8%,transparent)] text-[var(--wireline-color-status-error)]",
    icon: XCircle,
  },
  unknown: {
    label: "Unknown",
    tone: "text-muted-foreground",
    pill: "border-border bg-muted text-muted-foreground",
    icon: AlertTriangle,
  },
};

function presentationState(data: PublicHealth | null, loading: boolean): OverallState {
  if (loading && !data) return "unknown";
  return data?.overall ?? "unknown";
}

const STATES: readonly OverallState[] = ["operational", "degraded", "outage", "unknown"];
const isState = (value: unknown): value is ComponentState =>
  typeof value === "string" && (STATES as readonly string[]).includes(value);

/**
 * The feed is a network payload, so it is narrowed at the boundary rather than
 * asserted through a cast. Anything unrecognised reads as "unknown", which is
 * safer than letting a malformed public-health response take down Status.
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
      voice_runtime: isState(components.voice_runtime) ? components.voice_runtime : "unknown",
      voice_fallback: isState(components.voice_fallback) ? components.voice_fallback : "unknown",
      reasoning: isState(components.reasoning) ? components.reasoning : "unknown",
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
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch("/api/health/public", {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: controller.signal,
        });

        let rawText = "";
        try {
          rawText = await res.text();
        } catch {
          await res.body?.cancel().catch(() => undefined);
          throw new Error(res.ok ? "Unreadable status payload" : `HTTP ${res.status}`);
        }
        let parsed: unknown = null;
        try {
          parsed = rawText ? JSON.parse(rawText) : null;
        } catch {
          parsed = null;
        }
        const json = normalizeHealth(parsed);
        if (!json) throw new Error(res.ok ? "Unrecognised status payload" : `HTTP ${res.status}`);
        if (!cancelled) {
          setData(json);
          setError(
            res.ok
              ? null
              : "Showing the last reported snapshot while the live probe cache is unavailable.",
          );
        }
      } catch (_err) {
        if (!cancelled) setError("Status feed temporarily unavailable.");
      } finally {
        window.clearTimeout(timeout);
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
  const headline = loading
    ? "Checking…"
    : overall === "operational"
      ? "Provider checks operational"
      : overall === "degraded"
        ? "Provider checks degraded"
        : overall === "outage"
          ? "Provider check failed"
          : "Status temporarily unavailable";

  return (
    <>
      <PageMeta
        title="Provider Status | BotBound"
        description="Live access checks for BotBound's managed voice control plane and reasoning runtime. Page refreshes every 60 seconds."
        path="/status"
      />
      <MarketingChrome stickyCta={false}>
        <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
          <header className="border-b border-border pb-8 sm:pb-10" data-testid="status-overall">
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border ${STATE_META[overall].pill}`}
                aria-hidden="true"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <OverallIcon className="h-4 w-4" strokeWidth={1.8} />
                )}
              </span>
              <span className={`text-xs font-semibold uppercase tracking-[0.12em] ${STATE_META[overall].tone}`}>
                {loading ? "Checking" : STATE_META[overall].label}
              </span>
            </div>

            <h1 className="mt-6 max-w-[15ch] font-[family-name:var(--wireline-font-family-display)] text-[clamp(2.6rem,8vw,4.8rem)] font-bold leading-[0.94] tracking-[-0.055em] text-foreground">
              {headline}
            </h1>

            <p className="mt-4 max-w-xl text-[15px] leading-6 text-muted-foreground">
              {data?.last_checked ? (
                <>
                  Last checked{" "}
                  <time dateTime={data.last_checked} className="text-foreground">
                    {new Date(data.last_checked).toLocaleString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                      timeZoneName: "short",
                    })}
                  </time>
                  ; page refreshes every 60s.
                </>
              ) : error ? (
                "We could not reach the public status feed. This is not treated as a service outage until a live probe confirms one."
              ) : (
                "Probing the live runtime…"
              )}
            </p>
            {error && data ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{error}</p>
            ) : null}
          </header>

          <section className="border-b border-border" aria-label="Runtime checks">
            {(Object.keys(COMPONENT_META) as Array<keyof typeof COMPONENT_META>).map((key) => {
              const meta = COMPONENT_META[key];
              const state = data?.components[key] ?? "unknown";
              const stateMeta = STATE_META[state];
              const Icon = meta.icon;
              const StateIcon = stateMeta.icon;
              return (
                <div
                  key={key}
                  className="flex min-h-[76px] items-center gap-3 border-t border-border py-4"
                  data-testid={`status-component-${key}`}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground/75">
                    <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[15px] font-semibold tracking-[-0.01em] text-foreground">
                      {meta.label}
                    </strong>
                    <small className="mt-0.5 block text-xs text-muted-foreground">{meta.detail}</small>
                  </span>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${stateMeta.pill}`}
                  >
                    <StateIcon className="h-3 w-3" aria-hidden="true" />
                    {stateMeta.label}
                  </span>
                </div>
              );
            })}
          </section>

          <details className="group border-b border-border py-5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-foreground marker:hidden">
              <span>How status works</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="pb-2 pt-2 text-sm leading-6 text-muted-foreground">
              <p>
                BotBound checks managed call control-plane access and performs a minimal,
                non-persistent inference against the managed reasoning provider. These are provider-access
                checks, not an end-to-end customer call.
              </p>
              <p className="mt-3">
                Normal provider results are cached for 120 seconds. During a distributed-cache incident the
                server may use its last known result for up to five minutes, while edge stale-while-revalidate
                can briefly extend delivery beyond that. The timestamp above is the authoritative age of the
                displayed reading.
              </p>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground/70">
                <span>Page refresh · 60s</span>
                <span>Normal cache · 120s</span>
                <span>Server fallback · up to 5m</span>
              </div>
              <div className="mt-4 flex gap-4 text-xs font-semibold">
                <Link to="/security" className="text-foreground underline-offset-4 hover:underline">
                  Security practices
                </Link>
                <Link to="/support" className="text-foreground underline-offset-4 hover:underline">
                  Report an issue
                </Link>
              </div>
            </div>
          </details>
        </div>
      </MarketingChrome>
    </>
  );
}
