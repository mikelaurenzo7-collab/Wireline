import { useState } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  Phone,
  Plus,
  Link as LinkIcon,
  RotateCw,
  Trash2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { Panel } from "../PageShell";
import WebhooksManager from "../WebhooksManager";
import IntakeKeysManager from "../IntakeKeysManager";
import PhoneNumberPicker from "../PhoneNumberPicker";
import { cn } from "../../lib/utils";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { AdminSaveBar } from "./AdminSaveBar";
import { OPS_ADMIN } from "../../lib/wireline-ops-design";

const CARRIER_AGENT_UNSET = "__unset__";

interface CarrierPanelProps {
  settings: CarrierSettings;
  agents: CarrierAgent[];
  phoneNumbers: PhoneNumber[];
  carrierNumbers: CarrierNumber[];
  isSaving: boolean;
  isSyncing: boolean;
  onUpdateSettings: (s: CarrierSettings) => void;
  onSaveSettings: () => void;
  onSyncNumbers: () => void;
  onAddNumber: (number: string, vapiId: string) => void;
  onDeleteNumber: (id: string | number) => void;
  onUpdateNumberAgent: (id: string | number, agent_id: string) => void;
}

interface CarrierSettings {
  vapi_phone_number_id: string;
  vapi_phone_inbound_agent_id: string;
  subscription_status: string;
  max_agents: number;
  voice_llm_provider: string;
  voice_llm_model: string;
  twilio_messaging_enabled: boolean;
  twilio_lookup_enabled: boolean;
  twilio_manager_alerts_enabled: boolean;
  twilio_messaging_service_sid: string;
  twilio_sms_from_number: string;
  twilio_whatsapp_from_number: string;
  twilio_manager_alert_number: string;
  prospecting_enabled: boolean;
  target_titles: string[];
  target_industries: string[];
  target_states: string[];
  target_employee_ranges: string[];
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
  byoc_enabled?: boolean;
}

interface CarrierAgent {
  id: string;
  name: string;
  channel?: string | null;
}

interface PhoneNumber {
  id: string | number;
  phone_number: string;
  vapi_number_id?: string | null;
  agent_id?: string | null;
  campaign_label?: string | null;
}

type CarrierNumber = Record<string, unknown>;

export function CarrierPanel({
  settings,
  agents,
  phoneNumbers,
  isSaving,
  isSyncing,
  onUpdateSettings,
  onSaveSettings,
  onSyncNumbers,
  onAddNumber,
  onDeleteNumber,
  onUpdateNumberAgent,
}: CarrierPanelProps) {
  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");
  const hasBrowserVoiceKey = Boolean(import.meta.env?.VITE_VAPI_PUBLIC_KEY);

  const handleSync = async () => {
    // In a real scenario, this would call an API or the prop
    onSyncNumbers();
    // For local UI state, we might need a way to get the synced numbers back
    // but here we follow the existing pattern in AdminSettings
  };

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0 overflow-y-auto panel-scroll pb-4">
      {/* Carrier authentication */}
      <Panel title="Wireline Voice Network" hint="CALLS" icon={Cpu} scroll>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-md wl-panel border border-brand/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                <p className="wl-label text-foreground/80">Voice network key</p>
              </div>
              <p className="wl-label text-primary">Managed by Wireline</p>
            </div>
            <div
              className={cn(
                "rounded-md border p-3 space-y-1.5",
                hasBrowserVoiceKey
                  ? "bg-primary/10 border-primary/30"
                  : "bg-rose-500/10 border-rose-500/30",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse",
                    hasBrowserVoiceKey ? "bg-brand" : "bg-rose-500",
                  )}
                />
                <p className="wl-label text-foreground/80">Browser voice key</p>
              </div>
              <p className={cn("wl-label", hasBrowserVoiceKey ? "text-primary" : "text-rose-500")}>
                {hasBrowserVoiceKey ? "Connected" : "Missing"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vapi-phone-number-id" className="wl-label text-foreground/55">
              Default carrier peering ID
            </label>
            <Input
              id="vapi-phone-number-id"
              type="text"
              value={settings.vapi_phone_number_id}
              onChange={(e) =>
                onUpdateSettings({ ...settings, vapi_phone_number_id: e.target.value })
              }
              className="w-full text-sm bg-muted border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-primary/40 text-foreground placeholder:text-muted-foreground font-mono"
              placeholder="e.g. 3c7a9f…"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vapi-inbound-agent-id" className="wl-label text-foreground/55">
              Default inbound voice agent
            </label>
            <div className="relative">
              <Select
                value={settings.vapi_phone_inbound_agent_id || CARRIER_AGENT_UNSET}
                onValueChange={(v) =>
                  onUpdateSettings({
                    ...settings,
                    vapi_phone_inbound_agent_id: v === CARRIER_AGENT_UNSET ? "" : v,
                  })
                }
              >
                <SelectTrigger
                  id="vapi-inbound-agent-id"
                  className="w-full text-sm bg-black/5 border border-input rounded-md pl-3 py-2 text-foreground h-auto"
                >
                  <SelectValue placeholder="Oldest voice agent (fallback)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CARRIER_AGENT_UNSET}>Oldest voice agent (fallback)</SelectItem>
                  {agents
                    .filter(
                      (a) => a.channel === "voice" || a.channel === "omnichannel" || !a.channel,
                    )
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/8">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-muted" />
                  <span className="wl-label-muted font-bold group-open:text-primary transition-colors">
                    Advanced Cognitive Routing
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-open:rotate-90 transition-transform" />
              </summary>

              <div className="mt-4 space-y-4 pl-1">
                <p className="wl-micro-meta--muted leading-relaxed">
                  Wireline routes all intelligence through optimized enterprise-grade keys by
                  default. Configure custom routing only if your organization requires specific
                  model overrides.
                </p>

                <div className="rounded-md wl-panel border border-input p-4 space-y-3 bg-black/10">
                  <div className="wl-label text-primary">Custom Model Selection</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      {
                        v: "anthropic",
                        label: "Claude Sonnet 4.6",
                        sub: "PRIMARY",
                        desc: "Default live-call model for adaptive tone, tool reliability, and natural cadence.",
                      },
                      {
                        v: "google",
                        label: "Gemini 3.5 Flash",
                        sub: "FAST FALLBACK",
                        desc: "Low-latency outage fallback for Anthropic voice disruptions; GPT can remain a second-tier recovery path.",
                      },
                    ].map((p) => (
                      <ShadButton
                        key={p.v}
                        type="button"
                        variant="ghost"
                        disableAnimations
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            voice_llm_provider: p.v,
                            voice_llm_model:
                              p.v === "anthropic" ? "claude-sonnet-4-6" : "gemini-3.5-flash",
                          })
                        }
                        className={cn(
                          "w-full h-auto justify-start text-left rounded-md p-3 border",
                          settings.voice_llm_provider === p.v
                            ? "bg-brand/10 border-brand/40"
                            : "bg-black/20 border-input hover:border-white/30",
                        )}
                      >
                        <div className="flex items-baseline justify-between mb-0.5">
                          <span className="text-sm text-foreground">{p.label}</span>
                          <span className="wl-label-muted">{p.sub}</span>
                        </div>
                        <p className="wl-micro-meta--muted leading-snug">{p.desc}</p>
                      </ShadButton>
                    ))}
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <label htmlFor="voice-llm-model" className="wl-label text-foreground/55">
                      Model Revision Override
                    </label>
                    <Input
                      id="voice-llm-model"
                      type="text"
                      value={settings.voice_llm_model}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, voice_llm_model: e.target.value })
                      }
                      className="w-full text-sm bg-black/5 border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-brand/40 text-foreground font-mono"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <WebhooksManager />
          <IntakeKeysManager />

          <AdminSaveBar
            onClick={onSaveSettings}
            isSaving={isSaving}
            label={OPS_ADMIN.saveLabels.carrier}
          />
        </div>
      </Panel>

      {/* Pool picker — self-serve number provisioning */}
      <Panel title="Get a phone number" hint="POOL · LOCAL PRESENCE" icon={Phone} scroll>
        <PhoneNumberPicker
          onClaim={() => {
            // Re-sync the list panel below so the freshly-claimed
            // number appears immediately.
            onSyncNumbers();
          }}
        />
      </Panel>

      {/* Hub & routing */}
      <Panel title="Wireline Phone Numbers" hint="VOICE ROUTING" icon={Phone} scroll>
        <div className="space-y-3">
          {phoneNumbers.length === 0 ? (
            <div className="rounded-md wl-panel border border-white/10 border-dashed py-8 text-center">
              <p className="app-section-title/70">No active lines</p>
            </div>
          ) : (
            <div className="space-y-2">
              {phoneNumbers.map((pt) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={pt.id}
                  className="rounded-md wl-panel border border-input p-3 flex flex-col xl:flex-row xl:items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic text-lg text-foreground leading-none tabular-nums truncate">
                      {pt.phone_number}
                    </div>
                    <div className="wl-label text-foreground/55 mt-1 font-mono">
                      {pt.vapi_number_id?.substring(0, 16)}…
                    </div>
                  </div>
                  <Input
                    type="text"
                    defaultValue={pt.campaign_label || ""}
                    placeholder="Campaign tag (e.g. Google Ads · Spring '26)"
                    title="Optional campaign label for attribution. Calls answered on this number get tagged so /insights can break down ROI by source."
                    onBlur={async (e) => {
                      const next = e.target.value.trim();
                      if (next === (pt.campaign_label || "")) return;
                      try {
                        const { authFetch } = await import("../../lib/api");
                        await authFetch(`/api/phone-numbers/${pt.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ campaign_label: next }),
                        });
                        pt.campaign_label = next;
                      } catch {
                        /* silent — Account Holder will see no save indicator */
                      }
                    }}
                    className="text-[var(--wireline-typography-caption-size)] bg-[var(--wireline-color-surface-subtle)] border border-[var(--wireline-color-border-default)] rounded-md px-2.5 py-1.5 outline-none focus-visible:ring-[var(--wireline-color-focus-default)]/40 text-[var(--wireline-color-text-primary)] min-w-[200px] placeholder:text-[var(--wireline-color-text-secondary)]/55 h-auto"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <LinkIcon className="w-3 h-3 text-primary" />
                    <div className="relative">
                      <Select
                        value={pt.agent_id || CARRIER_AGENT_UNSET}
                        onValueChange={(v) =>
                          onUpdateNumberAgent(pt.id, v === CARRIER_AGENT_UNSET ? "" : v)
                        }
                      >
                        <SelectTrigger
                          aria-label={`Assign agent to ${pt.phone_number}`}
                          className="text-xs bg-black/5 border border-input rounded-md pl-2.5 py-1.5 text-foreground min-w-[150px] h-auto"
                        >
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CARRIER_AGENT_UNSET}>Unassigned</SelectItem>
                          {agents
                            .filter(
                              (a) =>
                                a.channel === "voice" || a.channel === "omnichannel" || !a.channel,
                            )
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <ShadButton
                      type="button"
                      aria-label={`Delete ${pt.phone_number}`}
                      onClick={() => onDeleteNumber(pt.id)}
                      variant="outline"
                      className="w-7 h-7 rounded-full wl-panel border border-input flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all p-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </ShadButton>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="rounded-md wl-panel border border-input p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="wl-label text-foreground inline-flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-primary" /> Add Wireline number
              </h4>
              <ShadButton
                onClick={handleSync}
                disabled={isSyncing}
                variant="outline"
                className="disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 wl-label text-foreground/55 hover:text-primary transition-colors h-auto py-1 px-2 border-input"
              >
                {isSyncing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCw className="w-3 h-3" />
                )}
                Sync numbers
              </ShadButton>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="+1 800 555 0100"
                className="w-full text-sm bg-black/5 border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-brand/40 text-foreground tabular-nums h-auto"
              />
              <Input
                type="text"
                value={newNumberVapiId}
                onChange={(e) => setNewNumberVapiId(e.target.value)}
                placeholder="Wireline voice number ID"
                className="w-full text-sm bg-black/5 border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-brand/40 text-foreground font-mono h-auto"
              />
            </div>
            <ShadButton
              onClick={() => {
                onAddNumber(newNumber, newNumberVapiId);
                setNewNumber("");
                setNewNumberVapiId("");
              }}
              disabled={!newNumber || !newNumberVapiId}
              variant="outline"
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 border border-brand/40 text-primary wl-label hover:bg-brand/25 transition-colors disabled:opacity-30 border-input"
            >
              <Plus className="w-3 h-3" /> Register number
            </ShadButton>
          </div>
        </div>
      </Panel>

      {/* SMS / text messaging — white-label posture: SMS reply
          handling is wired to OUR Twilio account by default. Customers
          never paste a webhook URL anywhere. The Inbound-Webhook panel
          only renders for BYOC (bring-your-own-carrier) tenants. */}
      <Panel
        title="SMS &amp; text messaging"
        hint="OUTBOUND TEXTS · OPT-OUT TRACKED"
        icon={Phone}
        scroll
      >
        <div className="space-y-3">
          {settings?.byoc_enabled && (
            <div className="rounded-md border border-brand/30 bg-brand/[0.06] p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-foreground leading-none">
                    Bring-your-own-carrier webhook
                  </p>
                  <p className="wl-micro-meta--muted mt-1 leading-relaxed">
                    You're on a BYOC plan — paste this URL as the "A Message Comes In" webhook on
                    each of your carrier numbers.
                  </p>
                </div>
                <ShadButton
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      "https://trywireline.com/api/twilio-webhook/sms",
                    );
                  }}
                  variant="outline"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-primary wl-label hover:bg-brand/25 transition-colors border-input h-auto"
                >
                  Copy URL
                </ShadButton>
              </div>
              <code className="block text-[var(--wireline-typography-caption-size)] font-mono text-foreground/90 bg-black/15 px-2.5 py-1.5 rounded select-all break-all">
                https://trywireline.com/api/twilio-webhook/sms
              </code>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border border-input bg-white/[0.02] p-3">
            <div>
              <p className="text-sm text-foreground leading-none">Enable outbound SMS</p>
              <p className="wl-micro-meta mt-1 leading-relaxed">
                Lets your agents follow up via text. Replies trigger TCPA opt-out tracking.
              </p>
            </div>
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  twilio_messaging_enabled: !settings.twilio_messaging_enabled,
                })
              }
              aria-label="Toggle outbound SMS"
              aria-pressed={!!settings.twilio_messaging_enabled}
              className={cn(
                "shrink-0 w-11 h-6 rounded-full p-0 relative",
                settings.twilio_messaging_enabled ? "bg-brand hover:bg-brand" : "bg-black/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-card transition-all shadow",
                  settings.twilio_messaging_enabled ? "left-5" : "left-0.5",
                )}
              />
            </ShadButton>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="twilio-sms-from" className="wl-label text-foreground/55">
              SMS sender number
            </label>
            <Input
              id="twilio-sms-from"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={settings.twilio_sms_from_number || ""}
              onChange={(e) =>
                onUpdateSettings({ ...settings, twilio_sms_from_number: e.target.value })
              }
              placeholder="+1 800 555 0100"
              className="w-full text-sm bg-muted border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-primary/40 text-foreground placeholder:text-muted-foreground font-mono h-auto"
            />
            <p className="wl-micro-meta leading-relaxed">
              A carrier-verified number you own. Outbound texts go from this number.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="twilio-messaging-sid" className="wl-label text-foreground/55">
              OR Messaging Service SID (recommended for scale)
            </label>
            <Input
              id="twilio-messaging-sid"
              type="text"
              value={settings.twilio_messaging_service_sid || ""}
              onChange={(e) =>
                onUpdateSettings({ ...settings, twilio_messaging_service_sid: e.target.value })
              }
              placeholder="MG••••••••••••••••••••••••••••••••"
              className="w-full text-sm bg-muted border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-primary/40 text-foreground placeholder:text-muted-foreground font-mono h-auto"
            />
            <p className="wl-micro-meta leading-relaxed">
              Wireline's managed number pool with auto-failover. Overrides the single sender above.
            </p>
          </div>

          <AdminSaveBar
            onClick={onSaveSettings}
            isSaving={isSaving}
            label={OPS_ADMIN.saveLabels.carrierMessaging}
            className="mt-2"
            fullWidth
          />

          {/* ─── Account Holder alert routing ─────────────────────────────
              Surfaces the existing settings columns that have been in
              the DB + the NotificationService backend the whole time
              but had no UI. When ON, Wireline texts the Account Holder's
              phone when an agent does something interesting:
                - Caller asked to escalate to a human
                - Agent booked an appointment (positive signal)
                - Hot lead detected (high-intent score)
                - Trial usage hit 80%
                - Webhook delivery failed
              The wireline_settings table has had `twilio_manager_alerts_enabled`
              + `twilio_manager_alert_number` columns since the schema
              was set up — this just exposes them to account holders. */}
          <div className="mt-6 pt-5 border-t border-input space-y-3">
            <div>
              <p className="wl-label text-foreground/55 mb-1">Alerts to you</p>
              <p className="text-[var(--wireline-typography-caption-size)] text-muted leading-relaxed">
                Have Wireline text YOU when your agents do something worth knowing about — booked
                meetings, escalations, hot leads, trial milestones.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-input bg-white/[0.02] p-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground leading-none">Account Holder alerts</p>
                <p className="wl-micro-meta mt-1 leading-relaxed">
                  We'll text the number below when notable events happen.
                </p>
              </div>
              <ShadButton
                type="button"
                variant="ghost"
                size="icon"
                disableAnimations
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    twilio_manager_alerts_enabled: !settings.twilio_manager_alerts_enabled,
                  })
                }
                aria-label="Toggle manager SMS alerts"
                aria-pressed={!!settings.twilio_manager_alerts_enabled}
                className={cn(
                  "shrink-0 w-11 h-6 rounded-full p-0 relative",
                  settings.twilio_manager_alerts_enabled
                    ? "bg-brand hover:bg-brand"
                    : "bg-black/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-card transition-all shadow",
                    settings.twilio_manager_alerts_enabled ? "left-5" : "left-0.5",
                  )}
                />
              </ShadButton>
            </div>

            {settings.twilio_manager_alerts_enabled && (
              <div className="space-y-1.5">
                <label htmlFor="manager-alert-number" className="wl-label text-foreground/55">
                  Your phone number
                </label>
                <Input
                  id="manager-alert-number"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={settings.twilio_manager_alert_number || ""}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      twilio_manager_alert_number: e.target.value,
                    })
                  }
                  placeholder="+1 555 555 0100"
                  className="w-full text-sm bg-muted border border-input rounded-md px-3 py-2 outline-none focus-visible:ring-primary/40 text-foreground placeholder:text-muted-foreground font-mono h-auto"
                />
                <p className="wl-micro-meta leading-relaxed">
                  Standard messaging rates apply. We send no more than ~5 alerts per day per agent
                  under normal use.
                </p>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}
