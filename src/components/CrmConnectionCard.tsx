import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link2, Unlink, Loader2, ExternalLink, CheckCircle2, Settings } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { toolIntegrationForProvider, PROVIDER_ACCENT } from "../lib/integration-playbooks";
import IntegrationCapabilityPanel from "./IntegrationCapabilityPanel";
import { getIntegrationLogo } from "./layout/IntegrationLogos";
import { WL_APP_CLASSES } from "../lib/wireline-design-system";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/shadcn/Select";
import { Input } from "./ui/shadcn/Input";
import { Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";
import { BRAND } from "../constants/brand-colors";

const CRM_SELECT_UNSET = "__unset__";

export interface IntegrationStatus {
  connected: boolean;
  configured?: boolean;
  /** Apollo: platform APOLLO_API_KEY and/or OAuth app credentials on Vercel */
  platform_active?: boolean;
  /** Apollo: Admin can open OAuth popup (CLIENT_ID + SECRET) */
  oauth_connect_available?: boolean;
  email?: string;
  team?: string;
  instance_url?: string;
  connected_at?: string;
  /** Slack: selected default channel for agent notifications */
  default_channel_id?: string | null;
  /** Microsoft Teams notify target */
  team_id?: string | null;
  channel_id?: string | null;
  team_name?: string | null;
  channel_name?: string | null;
}

interface IntegrationState {
  salesforce: IntegrationStatus;
  hubspot: IntegrationStatus;
  slack: IntegrationStatus;
  x: IntegrationStatus;
  zoom: IntegrationStatus;
  apollo: IntegrationStatus;
  meta: IntegrationStatus;
  shopify: IntegrationStatus;
  square: IntegrationStatus;
  microsoft_teams: IntegrationStatus;
  microsoft_excel: IntegrationStatus;
  google_sheets: IntegrationStatus;
}

type ProviderKey = keyof IntegrationState;

export type IntegrationAvailability = {
  available: boolean;
  connected: boolean;
  hasSavedGrant: boolean;
};

export type IntegrationPrimaryAction = "connected" | "disconnect" | "connect" | "unavailable";

/**
 * Platform configuration is authoritative. A saved tenant grant can outlive
 * the provider credentials needed to use or refresh it, so it must not render
 * as a live connection while the platform is unavailable.
 */
export function resolveIntegrationAvailability(
  status: IntegrationStatus | null | undefined,
): IntegrationAvailability {
  const hasSavedGrant = status?.connected === true;
  const available = Boolean(
    status && status.configured !== false && status.platform_active !== false,
  );
  return {
    available,
    connected: available && hasSavedGrant,
    hasSavedGrant,
  };
}

export function summarizeIntegrationAvailability(
  statuses: readonly (IntegrationStatus | null | undefined)[],
) {
  return statuses.reduce(
    (summary, status) => {
      const availability = resolveIntegrationAvailability(status);
      if (!availability.available) summary.unavailable += 1;
      else if (availability.connected) summary.live += 1;
      else summary.available += 1;
      return summary;
    },
    { live: 0, available: 0, unavailable: 0 },
  );
}

export function resolveIntegrationPrimaryAction(
  availability: IntegrationAvailability,
  oauthConnectAvailable: boolean,
): IntegrationPrimaryAction {
  if (availability.connected) return "connected";
  if (availability.hasSavedGrant) return "disconnect";
  if (availability.available && oauthConnectAvailable) return "connect";
  return "unavailable";
}

export const SAVED_CONNECTION_INACTIVE_HELP =
  "BotBound cannot use this saved authorization while the integration is unavailable. Disconnect to remove it from BotBound.";

export function getIntegrationStatusDetail(
  group: string,
  availability: IntegrationAvailability,
  oauthConnectAvailable: boolean,
  apolloPlatformOnly = false,
): string {
  const primaryAction = resolveIntegrationPrimaryAction(availability, oauthConnectAvailable);
  if (primaryAction === "disconnect") return `${group} · Saved connection inactive`;
  if (apolloPlatformOnly) {
    return `${group} · Platform API active. Connecting your workspace is optional`;
  }
  if (availability.available && oauthConnectAvailable) return group;
  if (availability.available) return `${group} · Platform configured`;
  return `${group} · Not available yet`;
}

import { ShadButton } from "./ui/shadcn/ShadButton";

/** Unified connected-state styling — mono brand tokens only. */
const CONNECTED_STYLES = {
  card: "border-brand/30 bg-brand/5",
  icon: "bg-brand/15 border-brand/30 text-brand",
  check: "text-brand",
  connect: "bg-brand/15 border-brand/30 text-brand hover:bg-brand/20",
};

const PROVIDERS: {
  key: ProviderKey;
  label: string;
  color: string;
  logo: string;
  group: string;
  beta?: boolean;
}[] = [
  {
    key: "salesforce",
    label: "Salesforce",
    color: "sky",
    logo: "SF",
    group: "CRM",
  },
  {
    key: "hubspot",
    label: "HubSpot",
    color: "orange",
    logo: "HS",
    group: "CRM",
  },
  {
    key: "slack",
    label: "Slack",
    color: "purple",
    logo: "SL",
    group: "Team",
  },
  {
    key: "x",
    label: "X",
    color: "neutral",
    logo: "X",
    group: "Social",
  },
  {
    key: "zoom",
    label: "Zoom",
    color: "blue",
    logo: "ZM",
    group: "Meetings",
    beta: true,
  },
  {
    key: "apollo",
    label: "Apollo",
    color: "indigo",
    logo: "AP",
    group: "Prospecting",
  },
  {
    key: "meta",
    label: "Meta (Lead Ads)",
    color: "fuchsia",
    logo: "M",
    group: "Ads",
    beta: true,
  },
  {
    key: "shopify",
    label: "Shopify",
    color: "emerald",
    logo: "SH",
    group: "E-commerce",
  },
  {
    key: "square",
    label: "Square",
    color: "amber",
    logo: "SQ",
    group: "E-commerce",
  },
  {
    key: "microsoft_teams",
    label: "Microsoft Teams",
    color: "indigo",
    logo: "MT",
    group: "Microsoft 365",
    beta: true,
  },
  {
    key: "microsoft_excel",
    label: "Microsoft Excel",
    color: "emerald",
    logo: "XL",
    group: "Microsoft 365",
    beta: true,
  },
  {
    key: "google_sheets",
    label: "Google Sheets",
    color: "emerald",
    logo: "GS",
    group: "Google Workspace",
    beta: true,
  },
];

export default function CrmConnectionCard() {
  const [state, setState] = useState<IntegrationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<
    { id: string; name: string; is_private?: boolean }[]
  >([]);
  const [slackChannelsLoading, setSlackChannelsLoading] = useState(false);
  const [teamsTargets, setTeamsTargets] = useState<
    { team_id: string; team_name: string; channel_id: string; channel_name: string }[]
  >([]);
  const [teamsTargetsLoading, setTeamsTargetsLoading] = useState(false);
  const [slackChannelsError, setSlackChannelsError] = useState<string | null>(null);
  const [teamsTargetsError, setTeamsTargetsError] = useState<string | null>(null);
  const [slackAttempt, setSlackAttempt] = useState(0);
  const [teamsAttempt, setTeamsAttempt] = useState(0);
  const [savingTarget, setSavingTarget] = useState(false);
  const [targetError, setTargetError] = useState<string | null>(null);
  const mounted = useRef(false);
  const statusRequest = useRef(0);
  const statusLoading = useRef(false);
  const targetSaveInFlight = useRef(false);
  const lifecycle = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifecycle.current += 1;
      statusRequest.current += 1;
      statusLoading.current = false;
      targetSaveInFlight.current = false;
    };
  }, []);
  // Shopify OAuth is per-store, so the Account Holder must supply their
  // myshopify domain before the Connect button can build the install
  // URL. Held here until they click Connect.
  const [shopDomain, setShopDomain] = useState("");
  const [shopError, setShopError] = useState<string | null>(null);
  /** Keep Shopify domain collapsed until Connect so the grid stays even. */
  const [shopDomainOpen, setShopDomainOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!mounted.current || targetSaveInFlight.current) return;
    const request = ++statusRequest.current;
    const isCurrent = () => mounted.current && request === statusRequest.current;
    statusLoading.current = true;
    try {
      const r = await authFetch("/api/oauth/crm/status");
      if (!r.ok) throw new Error("Could not load integration connections.");
      const data = (await r.json()) as IntegrationState | null;
      if (!data || !PROVIDERS.every(({ key }) => typeof data[key]?.connected === "boolean")) {
        throw new Error("Could not load integration connections.");
      }
      if (!isCurrent()) return;
      setState(data);
      setError(null);
    } catch (reason) {
      if (!isCurrent()) return;
      setState(null);
      setError(
        reason instanceof Error ? reason.message : "Could not load integration connections.",
      );
    } finally {
      if (isCurrent()) {
        statusLoading.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Started from a click handler, so nothing else tears it down: left alone the
  // popup-close poll outlives unmount and keeps firing every 500ms for the life
  // of the tab, holding a reference to the popup window with it.
  const popupPollRef = useRef<number | null>(null);
  const stopPopupPoll = useCallback(() => {
    if (popupPollRef.current !== null) {
      window.clearInterval(popupPollRef.current);
      popupPollRef.current = null;
    }
  }, []);
  useEffect(() => stopPopupPoll, [stopPopupPoll]);

  const slackConnected = resolveIntegrationAvailability(state?.slack).connected;
  const teamsConnected = resolveIntegrationAvailability(state?.microsoft_teams).connected;

  useEffect(() => {
    if (!slackConnected) {
      setSlackChannels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSlackChannelsLoading(true);
      setSlackChannelsError(null);
      try {
        const r = await authFetch("/api/oauth/slack/channels");
        if (!r.ok) throw new Error("Could not load Slack channels.");
        const d = await r.json();
        if (!Array.isArray(d?.channels)) {
          throw new Error("Could not load Slack channels.");
        }
        if (!cancelled) setSlackChannels(d.channels);
      } catch {
        if (!cancelled) setSlackChannelsError("Try loading the channel list again.");
      } finally {
        if (!cancelled) setSlackChannelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slackConnected, slackAttempt]);

  useEffect(() => {
    if (!teamsConnected) {
      setTeamsTargets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setTeamsTargetsLoading(true);
      setTeamsTargetsError(null);
      try {
        const r = await authFetch("/api/oauth/microsoft_teams/channels");
        if (!r.ok) throw new Error("Could not load Teams channels.");
        const d = await r.json();
        if (!Array.isArray(d?.channels)) {
          throw new Error("Could not load Teams channels.");
        }
        if (!cancelled) setTeamsTargets(d.channels);
      } catch {
        if (!cancelled) setTeamsTargetsError("Try loading the team and channel list again.");
      } finally {
        if (!cancelled) setTeamsTargetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamsConnected, teamsAttempt]);

  async function updateNotificationTarget(provider: "slack" | "microsoft_teams", value: string) {
    if (
      !mounted.current ||
      targetSaveInFlight.current ||
      statusLoading.current ||
      !value ||
      value === CRM_SELECT_UNSET
    )
      return;
    const slackChannel =
      provider === "slack" ? slackChannels.find((channel) => channel.id === value) : null;
    const teamsTarget =
      provider === "microsoft_teams"
        ? teamsTargets.find((target) => `${target.team_id}:${target.channel_id}` === value)
        : null;
    if (provider === "slack" && (!slackConnected || slackChannelsError || !slackChannel)) return;
    if (provider === "microsoft_teams" && (!teamsConnected || teamsTargetsError || !teamsTarget))
      return;

    targetSaveInFlight.current = true;
    const generation = lifecycle.current;
    const isCurrent = () => mounted.current && generation === lifecycle.current;
    setSavingTarget(true);
    setTargetError(null);
    try {
      const response = await authFetch(
        provider === "slack"
          ? "/api/oauth/slack/default-channel"
          : "/api/oauth/microsoft_teams/notify-target",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slackChannel ? { channel_id: slackChannel.id } : teamsTarget),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Could not save the notification destination. Try again.",
        );
      }
      if (!isCurrent()) return;
      setState((current) =>
        current
          ? {
              ...current,
              [provider]: {
                ...current[provider],
                ...(slackChannel ? { default_channel_id: slackChannel.id } : teamsTarget),
              },
            }
          : current,
      );
    } catch (reason) {
      if (isCurrent())
        setTargetError(
          reason instanceof Error
            ? reason.message
            : "Could not save the notification destination. Try again.",
        );
    } finally {
      if (isCurrent()) {
        targetSaveInFlight.current = false;
        setSavingTarget(false);
      }
    }
  }

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "CRM_OAUTH_SUCCESS") {
        // Consent already succeeded, so the close poll has nothing left to
        // detect and would otherwise run until the user closes the popup.
        stopPopupPoll();
        setConnecting(null);
        fetchStatus();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fetchStatus, stopPopupPoll]);

  const connect = (provider: ProviderKey) => async () => {
    if (targetSaveInFlight.current) return;
    // Shopify needs the merchant's myshopify domain appended as a
    // query param so the per-store install URL can be built.
    let endpoint = `/api/oauth/${provider}/url`;
    if (provider === "shopify") {
      const shop = shopDomain.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
        setShopDomainOpen(true);
        setShopError("Enter a valid store domain, e.g. your-store.myshopify.com");
        return;
      }
      setShopError(null);
      endpoint += `?shop=${encodeURIComponent(shop)}`;
    }
    setConnecting(provider);
    setError(null);
    const providerLabel = PROVIDERS.find((p) => p.key === provider)?.label || "This integration";
    try {
      const r = await authFetch(endpoint);
      if (!r.ok) {
        // Every provider gets a visible failure, not just Shopify — a silent
        // spinner-stop reads as a dead button during the Wire step.
        const body = await r.json().catch(() => ({}));
        const message =
          typeof body?.error === "string" && body.error
            ? body.error
            : `${providerLabel} connect could not start. Try again shortly.`;
        if (provider === "shopify") setShopError(message);
        else setError(message);
        setConnecting(null);
        return;
      }
      const { url } = await r.json();
      const popup = window.open(url, `${provider}_oauth`, "width=600,height=700,popup=yes");
      if (!popup) {
        setError(
          `Your browser blocked the ${providerLabel} sign-in window. Allow popups for this site and try again.`,
        );
        setConnecting(null);
        return;
      }
      // OAuth popups often close without postMessage — re-enable Connect when
      // dismissed. Clear any previous poll first: connecting a second provider
      // (or retrying the same one) would otherwise stack intervals that only
      // their own popup's close can stop.
      stopPopupPoll();
      popupPollRef.current = window.setInterval(() => {
        if (popup.closed) {
          stopPopupPoll();
          setConnecting(null);
        }
      }, 500);
    } catch {
      setError(
        `${providerLabel} connect failed to reach BotBound. Check your connection and try again.`,
      );
      setConnecting(null);
    }
  };

  const disconnect = (provider: ProviderKey) => async () => {
    if (targetSaveInFlight.current) return;
    if (
      !confirm(
        `Disconnect ${PROVIDERS.find((p) => p.key === provider)?.label}? Your Bots will lose access to this integration.`,
      )
    )
      return;
    setError(null);
    try {
      const response = await authFetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(
          typeof body?.error === "string"
            ? body.error
            : `Could not disconnect ${PROVIDERS.find((p) => p.key === provider)?.label || "this integration"}.`,
        );
        return;
      }
      await fetchStatus();
    } catch {
      setError("Could not disconnect this integration. Please try again.");
    }
  };

  const retry = () => {
    if (targetSaveInFlight.current) return;
    setLoading(true);
    void fetchStatus();
  };

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading integration connections…">
        <Skeleton className="h-11 w-full" shape="surface" />
        <div className="grid grid-cols-1 items-start sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
          {Array.from({ length: PROVIDERS.length }).map((_, i) => (
            <Skeleton key={i} className="h-24" shape="surface" />
          ))}
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <StatusNotice
        tone="destructive"
        title="Integration connections unavailable"
        action={
          <ShadButton type="button" variant="outline" size="sm" disableAnimations onClick={retry}>
            Retry
          </ShadButton>
        }
      >
        {error || "Could not load your connected integrations. Please try again."}
      </StatusNotice>
    );
  }

  const integrationSummary = summarizeIntegrationAvailability(
    PROVIDERS.map((provider) => state[provider.key]),
  );

  return (
    <div className="space-y-4">
      {targetError ? (
        <StatusNotice tone="destructive" title="Notification destination was not updated">
          {targetError}
        </StatusNotice>
      ) : null}
      {savingTarget ? (
        <StatusNotice title="Saving notification destination" aria-busy="true" />
      ) : null}
      {error ? (
        <StatusNotice
          tone="destructive"
          title="Integration connections unavailable"
          action={
            <ShadButton type="button" variant="outline" size="sm" disableAnimations onClick={retry}>
              Retry
            </ShadButton>
          }
        >
          {error}
        </StatusNotice>
      ) : null}
      <div className="rounded-md wl-panel border border-border px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={WL_APP_CLASSES.wiredEyebrow}>Connected stack</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="chip-brand">{integrationSummary.live} live</span>
          <span className="wl-label text-foreground/55">
            {integrationSummary.available} available
          </span>
          {integrationSummary.unavailable > 0 ? (
            <span className="wl-label text-foreground/55">
              {integrationSummary.unavailable} unavailable
            </span>
          ) : null}
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            onClick={retry}
            className="rounded-full wl-label"
            aria-label="Refresh integration status"
            disabled={savingTarget}
          >
            <Loader2 className="w-3 h-3" />
            Refresh
          </ShadButton>
        </div>
      </div>

      {/* One flat grid keeps the page symmetric at every viewport; each card
          carries its own category chip instead of a one-card section. */}
      <div className="grid grid-cols-1 items-start sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        <AnimatePresence mode="popLayout">
          {PROVIDERS.map(({ key, label, logo, group, beta }) => {
            const styles = CONNECTED_STYLES;
            const s = state[key];
            if (!s) return null;
            const isConnecting = connecting === key;
            const detail = s.email || s.team || "";
            const betaPill = beta ? (
              <span
                className="ml-1 shrink-0 wl-label px-1.5 py-0.5 rounded-md bg-brand/15 border border-brand/40 text-brand leading-none"
                title="OAuth is live; Bot actions (auto-log calls, push deals) are in active development."
              >
                Beta
              </span>
            ) : null;

            const availability = resolveIntegrationAvailability(s);
            const { available: platformReady, connected: isConnected } = availability;
            const oauthConnectAvailable = key !== "apollo" || s.oauth_connect_available !== false;
            const primaryAction = resolveIntegrationPrimaryAction(
              availability,
              oauthConnectAvailable,
            );
            const apolloPlatformOnly =
              key === "apollo" && platformReady && !oauthConnectAvailable && !isConnected;
            const statusDetail = getIntegrationStatusDetail(
              group,
              availability,
              oauthConnectAvailable,
              apolloPlatformOnly,
            );

            return (
              <motion.div
                key={key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-md wl-panel border max-sm:p-2.5 p-3 sm:p-4 h-full flex flex-col",
                  isConnected ? styles.card : "border-border",
                )}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-md flex items-center justify-center p-1.5 border shrink-0",
                      isConnected ? styles.icon : "bg-muted border border-border text-muted/50",
                    )}
                  >
                    {getIntegrationLogo(key) ?? <span className="wl-label font-bold">{logo}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* No wrap: the Beta pill stays glued to the name on every card
                        instead of dropping to its own row under longer labels. */}
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 truncate text-[length:var(--wireline-typography-overline-size)] font-semibold text-foreground">
                        {label}
                      </div>
                      {isConnected && (
                        <CheckCircle2 className={cn("w-3 h-3 shrink-0", styles.check)} />
                      )}
                      {betaPill}
                    </div>
                    {primaryAction === "connected" ? (
                      <div className="wl-micro-meta--muted leading-snug mt-0.5 truncate">
                        {detail && <span>{detail} · </span>}
                        Connected{" "}
                        {s.connected_at ? new Date(s.connected_at).toLocaleDateString() : ""}
                      </div>
                    ) : (
                      <div className="wl-micro-meta--muted leading-snug mt-0.5">{statusDetail}</div>
                    )}
                    {primaryAction === "disconnect" ? (
                      <p className="mt-1.5 max-w-[20rem] text-[length:var(--wireline-typography-caption-size)] leading-snug text-foreground/55">
                        {SAVED_CONNECTION_INACTIVE_HELP}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0">
                    {isConnected ? (
                      <div className="flex items-center gap-2">
                        {s.instance_url && (
                          <a
                            href={s.instance_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-foreground transition-colors"
                            title={`Open ${label}`}
                            aria-label={`Open ${label}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {key === "salesforce" && (
                          <Link
                            to="/connections/salesforce"
                            className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-foreground transition-colors"
                            title="Configure"
                            aria-label="Configure Salesforce"
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </Link>
                        )}
                        <ShadButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          disableAnimations
                          onClick={disconnect(key)}
                          disabled={savingTarget}
                          className="h-8 w-8 rounded-md text-muted hover:text-rose-500 hover:bg-rose-500/10"
                          title="Disconnect"
                          aria-label={`Disconnect ${label}`}
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </ShadButton>
                      </div>
                    ) : primaryAction === "disconnect" ? (
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={disconnect(key)}
                        disabled={savingTarget}
                        className="h-8 rounded-md wl-micro-meta font-medium text-foreground/70 hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/10"
                        title="Disconnect saved connection"
                        aria-label={`Disconnect ${label}`}
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        Disconnect
                      </ShadButton>
                    ) : primaryAction === "connect" ? (
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={connect(key)}
                        disabled={isConnecting || savingTarget}
                        aria-label={isConnecting ? `Connecting ${label}` : `Connect ${label}`}
                        className={cn(
                          "rounded-md wl-micro-meta font-medium",
                          CONNECTED_STYLES.connect,
                          isConnecting && "opacity-60 pointer-events-none",
                        )}
                      >
                        {isConnecting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Link2 className="w-3 h-3" />
                        )}
                        Connect
                      </ShadButton>
                    ) : (
                      <span className="wl-micro-meta--muted px-2">Unavailable</span>
                    )}
                  </div>
                </div>
                {isConnected &&
                  (() => {
                    const toolInt = toolIntegrationForProvider(key);
                    if (!toolInt) return null;
                    return (
                      <div className="mt-3 pt-3 border-t border-border hidden sm:block">
                        <IntegrationCapabilityPanel
                          integration={toolInt}
                          accentColor={PROVIDER_ACCENT[key] ?? BRAND.colors.primary}
                          connected
                          enabledTools={[]}
                          compact
                        />
                      </div>
                    );
                  })()}

                {key === "shopify" && !isConnected && shopDomainOpen && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                    <div className="wl-label text-muted/90">Your store domain</div>
                    <Input
                      type="text"
                      value={shopDomain}
                      onChange={(e) => {
                        setShopDomain(e.target.value);
                        if (shopError) setShopError(null);
                      }}
                      placeholder="your-store.myshopify.com"
                      spellCheck={false}
                      autoCapitalize="off"
                      autoFocus
                      className="w-full wl-micro-meta rounded-md bg-black/20 border border-white/10 px-2 py-1.5 text-foreground placeholder:text-foreground/55 outline-none focus:border-brand/40"
                    />
                    {shopError ? (
                      <p className="wl-micro-meta text-rose-500 leading-snug">{shopError}</p>
                    ) : (
                      <p className="wl-micro-meta leading-snug">
                        Enter your myshopify.com domain, then click Connect to authorize.
                      </p>
                    )}
                  </div>
                )}
                {key === "slack" && isConnected && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="wl-label text-muted/90">Default notify channel</div>
                    {slackChannelsLoading ? (
                      <div className="flex items-center gap-2 wl-micro-meta--muted">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading channels…
                      </div>
                    ) : slackChannelsError ? (
                      <StatusNotice
                        tone="warning"
                        title="Slack channels unavailable"
                        action={
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setSlackAttempt((value) => value + 1)}
                          >
                            Retry channels
                          </ShadButton>
                        }
                      >
                        {slackChannelsError}
                      </StatusNotice>
                    ) : slackChannels.length === 0 ? (
                      <p className="wl-micro-meta--muted">
                        No Slack channels are available to this connection.
                      </p>
                    ) : (
                      <Select
                        value={s.default_channel_id || CRM_SELECT_UNSET}
                        disabled={savingTarget}
                        onValueChange={(value) => void updateNotificationTarget("slack", value)}
                      >
                        <SelectTrigger
                          aria-label="Default Slack channel"
                          className="w-full wl-micro-meta rounded-md bg-black/20 border border-white/10 px-2 py-1.5 text-foreground h-auto"
                        >
                          <SelectValue placeholder="Select channel…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CRM_SELECT_UNSET}>Select channel…</SelectItem>
                          {slackChannels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>
                              {ch.is_private ? "Private: " : "# "}
                              {ch.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <p className="wl-micro-meta leading-snug">
                      After OAuth we auto-pick #general when possible. Agents post bookings and
                      alerts here. Change anytime.
                    </p>
                  </div>
                )}
                {key === "microsoft_teams" && isConnected && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="wl-label text-muted/90">Notify team & channel</div>
                    {teamsTargetsLoading ? (
                      <div className="flex items-center gap-2 wl-micro-meta--muted">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading teams…
                      </div>
                    ) : teamsTargetsError ? (
                      <StatusNotice
                        tone="warning"
                        title="Teams channels unavailable"
                        action={
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTeamsAttempt((value) => value + 1)}
                          >
                            Retry channels
                          </ShadButton>
                        }
                      >
                        {teamsTargetsError}
                      </StatusNotice>
                    ) : teamsTargets.length === 0 ? (
                      <p className="wl-micro-meta--muted">
                        No Teams channels are available to this connection.
                      </p>
                    ) : (
                      <Select
                        value={
                          s.team_id && s.channel_id
                            ? `${s.team_id}:${s.channel_id}`
                            : CRM_SELECT_UNSET
                        }
                        disabled={savingTarget}
                        onValueChange={(value) =>
                          void updateNotificationTarget("microsoft_teams", value)
                        }
                      >
                        <SelectTrigger
                          aria-label="Default Teams team and channel"
                          className="w-full wl-micro-meta rounded-md bg-black/20 border border-white/10 px-2 py-1.5 text-foreground h-auto"
                        >
                          <SelectValue placeholder="Select team channel…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CRM_SELECT_UNSET}>Select team channel…</SelectItem>
                          {teamsTargets.map((t) => (
                            <SelectItem
                              key={`${t.team_id}:${t.channel_id}`}
                              value={`${t.team_id}:${t.channel_id}`}
                            >
                              {t.team_name} / {t.channel_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {s.team_name && s.channel_name ? (
                      <p className="wl-micro-meta leading-snug">
                        Current: {s.team_name} → {s.channel_name}
                      </p>
                    ) : (
                      <p className="wl-micro-meta leading-snug">
                        Pick where call alerts post. Without a selection we use your first team
                        channel.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
