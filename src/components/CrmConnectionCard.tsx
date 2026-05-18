import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Link2, Unlink, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

interface IntegrationStatus {
  connected: boolean;
  configured?: boolean;
  email?: string;
  team?: string;
  instance_url?: string;
  connected_at?: string;
  /** Slack: selected default channel for agent notifications */
  default_channel_id?: string | null;
}

interface IntegrationState {
  salesforce: IntegrationStatus;
  hubspot: IntegrationStatus;
  slack: IntegrationStatus;
  zoom: IntegrationStatus;
}

type ProviderKey = keyof IntegrationState;

const PROVIDERS: {
  key: ProviderKey;
  label: string;
  color: string;
  logo: string;
  group: string;
  envHint: string;
  beta?: boolean;
}[] = [
  {
    key: "salesforce",
    label: "Salesforce",
    color: "sky",
    logo: "SF",
    group: "CRM",
    envHint: "SALESFORCE_CLIENT_ID & SECRET",
    beta: true,
  },
  {
    key: "hubspot",
    label: "HubSpot",
    color: "orange",
    logo: "HS",
    group: "CRM",
    envHint: "HUBSPOT_CLIENT_ID & SECRET",
    beta: true,
  },
  {
    key: "slack",
    label: "Slack",
    color: "purple",
    logo: "SL",
    group: "Team",
    envHint: "SLACK_CLIENT_ID & SECRET",
  },
  {
    key: "zoom",
    label: "Zoom",
    color: "blue",
    logo: "ZM",
    group: "Meetings",
    envHint: "ZOOM_CLIENT_ID & SECRET",
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
    setConnecting(provider);
    try {
      const r = await authFetch(`/api/oauth/${provider}/url`);
      if (!r.ok) {
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

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const groupProviders = PROVIDERS.filter((p) => p.group === group);
        return (
          <div key={group} className="space-y-3">
            <div className="text-[9px] uppercase tracking-[0.3em] text-brand/70">
              {group} Integrations
            </div>
            <AnimatePresence mode="popLayout">
              {groupProviders.map(({ key, label, color, logo, envHint, beta }) => {
                const s = state[key];
                if (!s) return null;
                const isConnecting = connecting === key;
                const detail = s.email || s.team || "";
                const betaPill = beta ? (
                  <span
                    className="ml-1 text-[8px] uppercase tracking-[0.22em] px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-600 leading-none"
                    title="OAuth is live; agent actions (auto-log calls, push deals) are in active development."
                  >
                    Beta
                  </span>
                ) : null;

                if (!s.connected && !s.configured) {
                  return (
                    <motion.div
                      key={key}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-xl glass border border-white/8 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-muted">
                          {logo}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[11px] font-semibold text-ink">{label}</div>
                            {betaPill}
                          </div>
                          <div className="text-[9px] text-muted leading-snug mt-0.5">
                            Not configured — set {envHint} in environment
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                }

                return (
                  <motion.div
                    key={key}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "rounded-xl glass border p-4",
                      s.connected ? `border-${color}-500/30 bg-${color}-500/5` : "border-white/8",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold border",
                          s.connected
                            ? `bg-${color}-500/15 border-${color}-500/30 text-${color}-600`
                            : "bg-white/5 border-white/10 text-muted",
                        )}
                      >
                        {logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-[11px] font-semibold text-ink">{label}</div>
                          {s.connected && <CheckCircle2 className={`w-3 h-3 text-${color}-600`} />}
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
                            Ready to connect — click to authorize
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
                        ) : (
                          <button
                            onClick={connect(key)}
                            disabled={isConnecting}
                            className={cn(
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
                        )}
                      </div>
                    </div>
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
                          Voice agents post booking confirmations here when this channel is set.
                        </p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
