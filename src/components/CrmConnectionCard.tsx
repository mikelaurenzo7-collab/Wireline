import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link2, Unlink, Loader2, ExternalLink, CheckCircle2, Settings } from "lucide-react";
import { Link } from "react-router-dom";
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

interface IntegrationStatus {
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
  // Shopify OAuth is per-store, so the Account Holder must supply their
  // myshopify domain before the Connect button can build the install
  // URL. Held here until they click Connect.
  const [shopDomain, setShopDomain] = useState("");
  const [shopError, setShopError] = useState<string | null>(null);
  /** Keep Shopify domain collapsed until Connect so the grid stays even. */
  const [shopDomainOpen, setShopDomainOpen] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await authFetch("/api/oauth/crm/status");
      if (!r.ok) throw new Error("Could not load integration connections.");
      setState(await r.json());
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load integration connections.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!state?.slack?.connected) {
      setSlackChannels([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSlackChannelsLoading(true);
      try {
        const r = await authFetch("/api/oauth/slack/channels");
        if (r.ok && !cancelled) {
          const d = await r.json();
          setSlackChannels(d.channels || []);
        }
      } finally {
        if (!cancelled) setSlackChannelsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state?.slack?.connected]);

  useEffect(() => {
    if (!state?.microsoft_teams?.connected) {
      setTeamsTargets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setTeamsTargetsLoading(true);
      try {
        const r = await authFetch("/api/oauth/microsoft_teams/channels");
        if (r.ok && !cancelled) {
          const d = await r.json();
          setTeamsTargets(d.channels || []);
        }
      } finally {
        if (!cancelled) setTeamsTargetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state?.microsoft_teams?.connected]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "CRM_OAUTH_SUCCESS") {
        setConnecting(null);
        fetchStatus();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [fetchStatus]);

  const connect = (provider: ProviderKey) => async () => {
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
    try {
      const r = await authFetch(endpoint);
      if (!r.ok) {
        if (provider === "shopify") {
          const body = await r.json().catch(() => ({}));
          setShopError(body?.error || "Could not start Shopify connect.");
        }
        setConnecting(null);
        return;
      }
      const { url } = await r.json();
      const popup = window.open(url, `${provider}_oauth`, "width=600,height=700,popup=yes");
      if (!popup) {
        setConnecting(null);
        return;
      }
      // OAuth popups often close without postMessage — re-enable Connect when dismissed.
      const poll = window.setInterval(() => {
        if (popup.closed) {
          window.clearInterval(poll);
          setConnecting(null);
        }
      }, 500);
    } catch {
      setConnecting(null);
    }
  };

  const disconnect = (provider: ProviderKey) => async () => {
    if (
      !confirm(
        `Disconnect ${PROVIDERS.find((p) => p.key === provider)?.label}? Your AI employees will lose access to this integration.`,
      )
    )
      return;
    try {
      await authFetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
      fetchStatus();
    } catch {
      /* ignore */
    }
  };

  const retry = () => {
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

  const connectedCount = PROVIDERS.filter((p) => state[p.key]?.connected).length;

  return (
    <div className="space-y-4">
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
          <span className="chip-brand">{connectedCount} live</span>
          <span className="wl-label text-foreground/55">
            {PROVIDERS.length - connectedCount} available
          </span>
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            onClick={retry}
            className="rounded-full wl-label"
            aria-label="Refresh integration status"
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
                className="ml-1 wl-label px-1.5 py-0.5 rounded-md bg-brand/15 border border-brand/40 text-brand leading-none"
                title="OAuth is live; AI employee actions (auto-log calls, push deals) are in active development."
              >
                Beta
              </span>
            ) : null;

            const platformReady = s.configured !== false;
            const oauthConnectAvailable = key !== "apollo" || s.oauth_connect_available !== false;
            const apolloPlatformOnly =
              key === "apollo" && platformReady && !oauthConnectAvailable && !s.connected;

            return (
              <motion.div
                key={key}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-md wl-panel border max-sm:p-2.5 p-3 sm:p-4 h-full flex flex-col",
                  s.connected ? styles.card : "border-border",
                )}
              >
                <div className="flex items-start gap-3 flex-1">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-md flex items-center justify-center p-1.5 border shrink-0",
                      s.connected ? styles.icon : "bg-muted border border-border text-muted/50",
                    )}
                  >
                    {getIntegrationLogo(key) ?? <span className="wl-label font-bold">{logo}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="text-[var(--wireline-typography-overline-size)] font-semibold text-foreground">
                        {label}
                      </div>
                      {s.connected && <CheckCircle2 className={cn("w-3 h-3", styles.check)} />}
                      {betaPill}
                    </div>
                    {s.connected ? (
                      <div className="wl-micro-meta--muted leading-snug mt-0.5 truncate">
                        {detail && <span>{detail} · </span>}
                        Connected{" "}
                        {s.connected_at ? new Date(s.connected_at).toLocaleDateString() : ""}
                      </div>
                    ) : (
                      <div className="wl-micro-meta--muted leading-snug mt-0.5">
                        {apolloPlatformOnly
                          ? `${group} · Platform API active — connecting your workspace is optional`
                          : platformReady && oauthConnectAvailable
                            ? `${group} · Ready to connect`
                            : platformReady
                              ? `${group} · Platform configured`
                              : `${group} · Not configured on this deployment`}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {s.connected ? (
                      <div className="flex items-center gap-2">
                        {s.instance_url && (
                          <a
                            href={s.instance_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-foreground transition-colors"
                            title={`Open ${label}`}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {key === "salesforce" && (
                          <Link
                            to="/connections/salesforce"
                            className="p-1.5 rounded-md hover:bg-white/10 text-muted hover:text-foreground transition-colors"
                            title="Configure"
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
                          className="h-8 w-8 rounded-md text-muted hover:text-rose-500 hover:bg-rose-500/10"
                          title="Disconnect"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </ShadButton>
                      </div>
                    ) : platformReady && oauthConnectAvailable ? (
                      <ShadButton
                        type="button"
                        variant="outline"
                        size="sm"
                        disableAnimations
                        onClick={connect(key)}
                        disabled={isConnecting}
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
                {s.connected &&
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

                {key === "shopify" && !s.connected && shopDomainOpen && (
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
                {key === "slack" && s.connected && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="wl-label text-muted/90">Default notify channel</div>
                    {slackChannelsLoading ? (
                      <div className="flex items-center gap-2 wl-micro-meta--muted">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading channels…
                      </div>
                    ) : (
                      <Select
                        value={s.default_channel_id || CRM_SELECT_UNSET}
                        onValueChange={async (v) => {
                          if (!v || v === CRM_SELECT_UNSET) return;
                          await authFetch("/api/oauth/slack/default-channel", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ channel_id: v }),
                          });
                          fetchStatus();
                        }}
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
                      alerts here — change anytime.
                    </p>
                  </div>
                )}
                {key === "microsoft_teams" && s.connected && (
                  <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                    <div className="wl-label text-muted/90">Notify team & channel</div>
                    {teamsTargetsLoading ? (
                      <div className="flex items-center gap-2 wl-micro-meta--muted">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading teams…
                      </div>
                    ) : (
                      <Select
                        value={
                          s.team_id && s.channel_id
                            ? `${s.team_id}:${s.channel_id}`
                            : CRM_SELECT_UNSET
                        }
                        onValueChange={async (raw) => {
                          if (!raw || raw === CRM_SELECT_UNSET) return;
                          const [team_id, channel_id] = raw.split(":");
                          const pick = teamsTargets.find(
                            (t) => t.team_id === team_id && t.channel_id === channel_id,
                          );
                          await authFetch("/api/oauth/microsoft_teams/notify-target", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              team_id,
                              channel_id,
                              team_name: pick?.team_name,
                              channel_name: pick?.channel_name,
                            }),
                          });
                          fetchStatus();
                        }}
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
