import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link2, Unlink, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { toolIntegrationForProvider, PROVIDER_ACCENT } from "../lib/integration-playbooks";
import IntegrationCapabilityPanel from "./IntegrationCapabilityPanel";
import { getIntegrationLogo } from "./layout/IntegrationLogos";

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

/** Inline style tokens per integration brand — Tailwind color utilities are
 *  remapped to brand purple in the @theme block, so semantic hex values must
 *  be applied via style props, not className. */
type ProviderStyle = {
  cardBorder: string;
  cardBg: string;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  checkColor: string;
};

const PROVIDER_STYLES: Record<string, ProviderStyle> = {
  sky: {
    cardBorder: "rgba(14,165,233,0.30)",
    cardBg: "rgba(14,165,233,0.05)",
    iconBg: "rgba(14,165,233,0.15)",
    iconBorder: "rgba(14,165,233,0.30)",
    iconColor: "#0369a1",
    checkColor: "#0284c7",
  },
  orange: {
    cardBorder: "rgba(249,115,22,0.30)",
    cardBg: "rgba(249,115,22,0.05)",
    iconBg: "rgba(249,115,22,0.15)",
    iconBorder: "rgba(249,115,22,0.30)",
    iconColor: "#c2410c",
    checkColor: "#ea580c",
  },
  purple: {
    cardBorder: "rgba(139,63,214,0.30)",
    cardBg: "rgba(139,63,214,0.05)",
    iconBg: "rgba(139,63,214,0.15)",
    iconBorder: "rgba(139,63,214,0.30)",
    iconColor: "#6d28d9",
    checkColor: "#7c3aed",
  },
  blue: {
    cardBorder: "rgba(59,130,246,0.30)",
    cardBg: "rgba(59,130,246,0.05)",
    iconBg: "rgba(59,130,246,0.15)",
    iconBorder: "rgba(59,130,246,0.30)",
    iconColor: "#1d4ed8",
    checkColor: "#2563eb",
  },
  indigo: {
    cardBorder: "rgba(99,102,241,0.30)",
    cardBg: "rgba(99,102,241,0.05)",
    iconBg: "rgba(99,102,241,0.15)",
    iconBorder: "rgba(99,102,241,0.30)",
    iconColor: "#4338ca",
    checkColor: "#4f46e5",
  },
  fuchsia: {
    cardBorder: "rgba(217,70,239,0.30)",
    cardBg: "rgba(217,70,239,0.05)",
    iconBg: "rgba(217,70,239,0.15)",
    iconBorder: "rgba(217,70,239,0.30)",
    iconColor: "#a21caf",
    checkColor: "#c026d3",
  },
  emerald: {
    cardBorder: "rgba(16,185,129,0.30)",
    cardBg: "rgba(16,185,129,0.05)",
    iconBg: "rgba(16,185,129,0.15)",
    iconBorder: "rgba(16,185,129,0.30)",
    iconColor: "#047857",
    checkColor: "#059669",
  },
  amber: {
    cardBorder: "rgba(245,158,11,0.30)",
    cardBg: "rgba(245,158,11,0.05)",
    iconBg: "rgba(245,158,11,0.15)",
    iconBorder: "rgba(245,158,11,0.30)",
    iconColor: "#b45309",
    checkColor: "#d97706",
  },
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
  const [connecting, setConnecting] = useState<string | null>(null);
  const [slackChannels, setSlackChannels] = useState<
    { id: string; name: string; is_private?: boolean }[]
  >([]);
  const [slackChannelsLoading, setSlackChannelsLoading] = useState(false);
  const [teamsTargets, setTeamsTargets] = useState<
    { team_id: string; team_name: string; channel_id: string; channel_name: string }[]
  >([]);
  const [teamsTargetsLoading, setTeamsTargetsLoading] = useState(false);
  // Shopify OAuth is per-store, so the operator must supply their
  // myshopify domain before the Connect button can build the install
  // URL. Held here until they click Connect.
  const [shopDomain, setShopDomain] = useState("");
  const [shopError, setShopError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await authFetch("/api/oauth/crm/status");
      if (r.ok) setState(await r.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
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
      window.open(url, `${provider}_oauth`, "width=600,height=700,popup=yes");
    } catch {
      setConnecting(null);
    }
  };

  const disconnect = (provider: ProviderKey) => async () => {
    if (
      !confirm(
        `Disconnect ${PROVIDERS.find((p) => p.key === provider)?.label}? Your agents will lose access to this integration.`,
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

  if (loading) {
    return (
      <div className="text-[11px] text-muted flex items-center gap-2 py-4">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking integration connections…
      </div>
    );
  }

  if (!state) return null;

  const groups = [...new Set(PROVIDERS.map((p) => p.group))];
  const connectedCount = PROVIDERS.filter((p) => state[p.key]?.connected).length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl glass border border-black/8 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[9px] uppercase tracking-[0.35em] text-brand font-semibold">
            Connected stack
          </p>
          <p className="text-caption mt-0.5">
            {connectedCount} of {PROVIDERS.length} integrations active — agents unlock tools per
            connection.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="chip-brand">{connectedCount} live</span>
          <span className="text-[9px] uppercase tracking-[0.28em] text-muted/70">
            {PROVIDERS.length - connectedCount} available
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchStatus();
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-black/10 text-[9px] uppercase tracking-[0.26em] text-muted hover:text-ink hover:border-brand/30 transition-colors"
            aria-label="Refresh integration status"
          >
            <Loader2 className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>

      {groups.map((group) => {
        const groupProviders = PROVIDERS.filter((p) => p.group === group);
        return (
          <div key={group} className="space-y-3">
            <div className="text-[9px] uppercase tracking-[0.3em] text-brand/70">
              {group} Integrations
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <AnimatePresence mode="popLayout">
                {groupProviders.map(({ key, label, color, logo, beta }) => {
                  const styles = PROVIDER_STYLES[color] ?? PROVIDER_STYLES.indigo;
                  const s = state[key];
                  if (!s) return null;
                  const isConnecting = connecting === key;
                  const detail = s.email || s.team || "";
                  const betaPill = beta ? (
                    <span
                      className="ml-1 text-[8px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-md leading-none"
                      style={{
                        background: "rgba(245,158,11,0.15)",
                        border: "1px solid rgba(245,158,11,0.40)",
                        color: "#d97706",
                      }}
                      title="OAuth is live; agent actions (auto-log calls, push deals) are in active development."
                    >
                      Beta
                    </span>
                  ) : null;

                  const platformReady = s.configured !== false;
                  const oauthConnectAvailable =
                    key !== "apollo" || s.oauth_connect_available !== false;
                  const apolloPlatformOnly =
                    key === "apollo" && platformReady && !oauthConnectAvailable && !s.connected;

                  return (
                    <motion.div
                      key={key}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl glass border p-4 h-full flex flex-col"
                      style={
                        s.connected
                          ? { borderColor: styles.cardBorder, background: styles.cardBg }
                          : undefined
                      }
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center p-1.5 border shrink-0"
                          style={
                            s.connected
                              ? {
                                  background: styles.iconBg,
                                  borderColor: styles.iconBorder,
                                  color: styles.iconColor,
                                }
                              : undefined
                          }
                        >
                          {getIntegrationLogo(key) ?? (
                            <span className="text-[10px] font-bold">{logo}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="text-[11px] font-semibold text-ink">{label}</div>
                            {s.connected && (
                              <CheckCircle2
                                className="w-3 h-3"
                                style={{ color: styles.checkColor }}
                              />
                            )}
                            {betaPill}
                          </div>
                          {s.connected ? (
                            <div className="text-[9px] text-muted leading-snug mt-0.5 truncate">
                              {detail && <span>{detail} · </span>}
                              Connected{" "}
                              {s.connected_at ? new Date(s.connected_at).toLocaleDateString() : ""}
                            </div>
                          ) : (
                            <div className="text-[9px] text-muted leading-snug mt-0.5">
                              {apolloPlatformOnly
                                ? "Platform Apollo API active — optional: connect your workspace below"
                                : platformReady && oauthConnectAvailable
                                  ? "Ready to connect — click to authorize"
                                  : platformReady
                                    ? "Platform configured"
                                    : "Platform OAuth credentials are not set on this deployment"}
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
                                  className="p-1.5 rounded-lg hover:bg-white/10 text-muted hover:text-ink transition-colors"
                                  title={`Open ${label}`}
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={disconnect(key)}
                                className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted hover:text-rose-500 transition-colors"
                                title="Disconnect"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : platformReady && oauthConnectAvailable ? (
                            <button
                              onClick={connect(key)}
                              disabled={isConnecting}
                              className={cn(
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all",
                                "bg-brand/15 border border-brand/30 text-brand hover:bg-brand/25",
                                isConnecting && "opacity-60 pointer-events-none",
                              )}
                            >
                              {isConnecting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Link2 className="w-3 h-3" />
                              )}
                              Connect
                            </button>
                          ) : (
                            <span className="text-[9px] text-muted px-2">Unavailable</span>
                          )}
                        </div>
                      </div>
                      {s.connected &&
                        (() => {
                          const toolInt = toolIntegrationForProvider(key);
                          if (!toolInt) return null;
                          return (
                            <div className="mt-3 pt-3 border-t border-black/8">
                              <IntegrationCapabilityPanel
                                integration={toolInt}
                                accentColor={PROVIDER_ACCENT[key] ?? "#8B3FD6"}
                                connected
                                enabledTools={[]}
                                compact
                              />
                            </div>
                          );
                        })()}

                      {key === "shopify" && !s.connected && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-1.5">
                          <div className="text-[9px] uppercase tracking-[0.25em] text-muted/90">
                            Your store domain
                          </div>
                          <input
                            type="text"
                            value={shopDomain}
                            onChange={(e) => {
                              setShopDomain(e.target.value);
                              if (shopError) setShopError(null);
                            }}
                            placeholder="your-store.myshopify.com"
                            spellCheck={false}
                            autoCapitalize="off"
                            className="w-full text-[10px] rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-ink placeholder:text-muted/70 outline-none transition-colors"
                          />
                          {shopError ? (
                            <p className="text-[9px] leading-snug" style={{ color: "#E8466A" }}>
                              {shopError}
                            </p>
                          ) : (
                            <p className="text-[9px] text-muted/70 leading-snug">
                              Enter your myshopify.com domain, then click Connect to authorize.
                            </p>
                          )}
                        </div>
                      )}
                      {key === "slack" && s.connected && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <div className="text-[9px] uppercase tracking-[0.25em] text-muted/90">
                            Default notify channel
                          </div>
                          {slackChannelsLoading ? (
                            <div className="flex items-center gap-2 text-[10px] text-muted">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading channels…
                            </div>
                          ) : (
                            <select
                              aria-label="Default Slack channel"
                              className="w-full text-[10px] rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-ink"
                              value={s.default_channel_id || ""}
                              onChange={async (e) => {
                                const channel_id = e.target.value;
                                if (!channel_id) return;
                                await authFetch("/api/oauth/slack/default-channel", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ channel_id }),
                                });
                                fetchStatus();
                              }}
                            >
                              <option value="">Select channel…</option>
                              {slackChannels.map((ch) => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.is_private ? "Private: " : "# "}
                                  {ch.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <p className="text-[9px] text-muted/70 leading-snug">
                            After OAuth we auto-pick #general when possible. Agents post bookings
                            and alerts here — change anytime.
                          </p>
                        </div>
                      )}
                      {key === "microsoft_teams" && s.connected && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <div className="text-[9px] uppercase tracking-[0.25em] text-muted/90">
                            Notify team & channel
                          </div>
                          {teamsTargetsLoading ? (
                            <div className="flex items-center gap-2 text-[10px] text-muted">
                              <Loader2 className="w-3 h-3 animate-spin" /> Loading teams…
                            </div>
                          ) : (
                            <select
                              aria-label="Default Teams team and channel"
                              className="w-full text-[10px] rounded-lg bg-black/20 border border-white/10 px-2 py-1.5 text-ink"
                              value={
                                s.team_id && s.channel_id ? `${s.team_id}:${s.channel_id}` : ""
                              }
                              onChange={async (e) => {
                                const raw = e.target.value;
                                if (!raw) return;
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
                              <option value="">Select team channel…</option>
                              {teamsTargets.map((t) => (
                                <option
                                  key={`${t.team_id}:${t.channel_id}`}
                                  value={`${t.team_id}:${t.channel_id}`}
                                >
                                  {t.team_name} / {t.channel_name}
                                </option>
                              ))}
                            </select>
                          )}
                          {s.team_name && s.channel_name ? (
                            <p className="text-[9px] text-muted/70 leading-snug">
                              Current: {s.team_name} → {s.channel_name}
                            </p>
                          ) : (
                            <p className="text-[9px] text-muted/70 leading-snug">
                              Pick where call alerts post. Without a selection we use your first
                              team channel.
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
      })}
    </div>
  );
}
