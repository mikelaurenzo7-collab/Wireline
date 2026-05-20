import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Cpu,
  Phone,
  Plus,
  KeyRound,
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

interface CarrierPanelProps {
  settings: any;
  agents: any[];
  phoneNumbers: any[];
  carrierNumbers: any[];
  isSaving: boolean;
  isSyncing: boolean;
  onUpdateSettings: (s: any) => void;
  onSaveSettings: () => void;
  onSyncNumbers: () => void;
  onAddNumber: (number: string, vapiId: string) => void;
  onDeleteNumber: (id: string | number) => void;
  onUpdateNumberAgent: (id: string | number, agent_id: string) => void;
}

export function CarrierPanel({
  settings,
  agents,
  phoneNumbers,
  carrierNumbers,
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

  const handleSync = async () => {
    // In a real scenario, this would call an API or the prop
    onSyncNumbers();
    // For local UI state, we might need a way to get the synced numbers back
    // but here we follow the existing pattern in AdminSettings
  };

  const providerDocsUrl =
    {
      google: "https://ai.google.dev/gemini-api/docs/models",
      anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    }[settings.voice_llm_provider] ?? "https://ai.google.dev/gemini-api/docs/models";

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0 overflow-y-auto panel-scroll pb-4">
      {/* Carrier authentication */}
      <Panel title="Wireline Voice Network" hint="CALLS" icon={Cpu} scroll>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-xl glass border border-brand/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">
                  Voice network key
                </p>
              </div>
              <p className="text-[9px] uppercase tracking-[0.3em] text-brand">
                Managed by Wireline
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3 space-y-1.5",
                (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-rose-500/10 border-rose-500/30",
              )}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse",
                    (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY
                      ? "bg-emerald-500"
                      : "bg-rose-500",
                  )}
                />
                <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">
                  Browser voice key
                </p>
              </div>
              <p
                className={cn(
                  "text-[9px] uppercase tracking-[0.3em]",
                  (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY
                    ? "text-emerald-500"
                    : "text-rose-500",
                )}
              >
                {(import.meta as any).env?.VITE_VAPI_PUBLIC_KEY ? "Connected" : "Missing"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="vapi-phone-number-id"
              className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
            >
              Default Wireline phone number ID
            </label>
            <input
              id="vapi-phone-number-id"
              type="text"
              value={settings.vapi_phone_number_id}
              onChange={(e) =>
                onUpdateSettings({ ...settings, vapi_phone_number_id: e.target.value })
              }
              className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
              placeholder="e.g. 3c7a9f…"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="vapi-inbound-agent-id"
              className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
            >
              Default inbound voice agent
            </label>
            <div className="relative">
              <select
                id="vapi-inbound-agent-id"
                value={settings.vapi_phone_inbound_agent_id}
                onChange={(e) =>
                  onUpdateSettings({ ...settings, vapi_phone_inbound_agent_id: e.target.value })
                }
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
              >
                <option value="">Oldest voice agent (fallback)</option>
                {agents
                  .filter((a) => a.channel === "voice" || a.channel === "omnichannel" || !a.channel)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/8">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none">
                <div className="flex items-center gap-2">
                  <Cpu className="w-3.5 h-3.5 text-muted" />
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold group-open:text-brand transition-colors">
                    Advanced Cognitive Routing
                  </span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-open:rotate-90 transition-transform" />
              </summary>

              <div className="mt-4 space-y-4 pl-1">
                <p className="text-[10px] text-muted leading-relaxed">
                  Wireline routes all intelligence through optimized enterprise-grade keys by
                  default. Configure custom routing only if your organization requires specific
                  model overrides.
                </p>

                <div className="rounded-2xl glass border border-white/10 p-4 space-y-3 bg-black/10">
                  <div className="text-[10px] uppercase tracking-[0.4em] text-brand">
                    Custom Model Selection
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      {
                        v: "google",
                        label: "Gemini 1.5 (Standard)",
                        sub: "FAST",
                        desc: "Lowest latency for high-volume queues.",
                      },
                      {
                        v: "anthropic",
                        label: "Claude Sonnet (Premium)",
                        sub: "RECOMMENDED",
                        desc: "Advanced reasoning, objection handling, and steering.",
                      },
                    ].map((p) => (
                      <button
                        key={p.v}
                        type="button"
                        onClick={() =>
                          onUpdateSettings({
                            ...settings,
                            voice_llm_provider: p.v,
                            voice_llm_model:
                              p.v === "google" ? "gemini-1.5-flash" : "claude-sonnet-4-6",
                          })
                        }
                        className={cn(
                          "text-left rounded-xl p-3 transition-all border",
                          settings.voice_llm_provider === p.v
                            ? "bg-brand/10 border-brand/40"
                            : "bg-black/20 border-white/8 hover:border-white/30",
                        )}
                      >
                        <div className="flex items-baseline justify-between mb-0.5">
                          <span className="text-sm text-ink">{p.label}</span>
                          <span className="text-[9px] uppercase tracking-[0.3em] text-muted">
                            {p.sub}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted/80 leading-snug">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <label
                      htmlFor="voice-llm-model"
                      className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
                    >
                      Model Revision Override
                    </label>
                    <input
                      id="voice-llm-model"
                      type="text"
                      value={settings.voice_llm_model}
                      onChange={(e) =>
                        onUpdateSettings({ ...settings, voice_llm_model: e.target.value })
                      }
                      className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink font-mono"
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <WebhooksManager />
          <IntakeKeysManager />

          <div className="pt-3 border-t border-white/8">
            <button
              onClick={onSaveSettings}
              disabled={isSaving}
              className="brutal-btn !py-2.5 !px-5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <KeyRound className="w-3.5 h-3.5" />
              )}
              Save settings
            </button>
          </div>
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
            <div className="rounded-xl glass border border-white/10 border-dashed py-8 text-center">
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">
                No active lines
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {phoneNumbers.map((pt) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={pt.id}
                  className="rounded-xl glass border border-white/8 p-3 flex flex-col xl:flex-row xl:items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic text-lg text-ink leading-none tabular-nums truncate">
                      {pt.phone_number}
                    </div>
                    <div className="text-[9px] uppercase tracking-[0.3em] text-muted/60 mt-1 font-mono">
                      {pt.vapi_number_id?.substring(0, 16)}…
                    </div>
                  </div>
                  <input
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
                        /* silent — operator will see no save indicator */
                      }
                    }}
                    className="text-[11px] bg-black/5 border border-black/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand/50 text-ink min-w-[200px] placeholder:text-muted/50"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <LinkIcon className="w-3 h-3 text-brand" />
                    <div className="relative">
                      <select
                        aria-label={`Assign agent to ${pt.phone_number}`}
                        value={pt.agent_id || ""}
                        onChange={(e) => onUpdateNumberAgent(pt.id, e.target.value)}
                        className="text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink min-w-[150px]"
                      >
                        <option value="">Unassigned</option>
                        {agents
                          .filter(
                            (a) =>
                              a.channel === "voice" || a.channel === "omnichannel" || !a.channel,
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                      <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                    </div>
                    <button
                      onClick={() => onDeleteNumber(pt.id)}
                      className="w-7 h-7 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] uppercase tracking-[0.3em] text-ink inline-flex items-center gap-1.5">
                <Plus className="w-3 h-3 text-brand" /> Add Wireline number
              </h4>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-muted/70 hover:text-brand transition-colors"
              >
                {isSyncing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RotateCw className="w-3 h-3" />
                )}
                Sync numbers
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="tel"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                placeholder="+1 800 555 0100"
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink tabular-nums"
              />
              <input
                type="text"
                value={newNumberVapiId}
                onChange={(e) => setNewNumberVapiId(e.target.value)}
                placeholder="Wireline voice number ID"
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink font-mono"
              />
            </div>
            <button
              onClick={() => {
                onAddNumber(newNumber, newNumberVapiId);
                setNewNumber("");
                setNewNumberVapiId("");
              }}
              disabled={!newNumber || !newNumberVapiId}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25 transition-colors disabled:opacity-30"
            >
              <Plus className="w-3 h-3" /> Register number
            </button>
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
            <div className="rounded-xl border border-brand/30 bg-brand/[0.06] p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-ink leading-none">Bring-your-own-carrier webhook</p>
                  <p className="text-[10px] text-muted/80 mt-1 leading-relaxed">
                    You're on a BYOC plan — paste this URL as the "A Message Comes In" webhook on
                    each of your carrier numbers.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      "https://trywireline.com/api/twilio-webhook/sms",
                    );
                  }}
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25 transition-colors"
                >
                  Copy URL
                </button>
              </div>
              <code className="block text-[11px] font-mono text-ink/90 bg-black/15 px-2.5 py-1.5 rounded select-all break-all">
                https://trywireline.com/api/twilio-webhook/sms
              </code>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div>
              <p className="text-sm text-ink leading-none">Enable outbound SMS</p>
              <p className="text-[10px] text-muted/70 mt-1 leading-relaxed">
                Lets your agents follow up via text. Replies trigger TCPA opt-out tracking.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  twilio_messaging_enabled: !settings.twilio_messaging_enabled,
                })
              }
              aria-pressed={!!settings.twilio_messaging_enabled}
              className={cn(
                "shrink-0 w-11 h-6 rounded-full transition-colors relative",
                settings.twilio_messaging_enabled ? "bg-brand" : "bg-black/15",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow",
                  settings.twilio_messaging_enabled ? "left-5" : "left-0.5",
                )}
              />
            </button>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="twilio-sms-from"
              className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
            >
              SMS sender number
            </label>
            <input
              id="twilio-sms-from"
              type="tel"
              value={settings.twilio_sms_from_number || ""}
              onChange={(e) =>
                onUpdateSettings({ ...settings, twilio_sms_from_number: e.target.value })
              }
              placeholder="+1 800 555 0100"
              className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
            />
            <p className="text-[10px] text-muted/60 leading-relaxed">
              A Twilio-verified number you own. Outbound texts go from this number.
            </p>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="twilio-messaging-sid"
              className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
            >
              OR Messaging Service SID (recommended for scale)
            </label>
            <input
              id="twilio-messaging-sid"
              type="text"
              value={settings.twilio_messaging_service_sid || ""}
              onChange={(e) =>
                onUpdateSettings({ ...settings, twilio_messaging_service_sid: e.target.value })
              }
              placeholder="MG••••••••••••••••••••••••••••••••"
              className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
            />
            <p className="text-[10px] text-muted/60 leading-relaxed">
              Twilio's pool of numbers with auto-failover. Overrides the single sender above.
            </p>
          </div>

          <button
            onClick={onSaveSettings}
            disabled={isSaving}
            className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25 transition-colors disabled:opacity-30"
          >
            {isSaving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <KeyRound className="w-3 h-3" />
            )}
            Save messaging config
          </button>

          {/* ─── Operator alert routing ─────────────────────────────
              Surfaces the existing settings columns that have been in
              the DB + the NotificationService backend the whole time
              but had no UI. When ON, Wireline texts the operator's
              phone when an agent does something interesting:
                - Caller asked to escalate to a human
                - Agent booked an appointment (positive signal)
                - Hot lead detected (high-intent score)
                - Trial usage hit 80%
                - Webhook delivery failed
              The wireline_settings table has had `twilio_manager_alerts_enabled`
              + `twilio_manager_alert_number` columns since the schema
              was set up — this just exposes them to operators. */}
          <div className="mt-6 pt-5 border-t border-black/10 space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mb-1">
                Alerts to you
              </p>
              <p className="text-[11px] text-muted leading-relaxed">
                Have Wireline text YOU when your agents do something worth knowing about — booked
                meetings, escalations, hot leads, trial milestones.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="min-w-0">
                <p className="text-sm text-ink leading-none">Operator alerts</p>
                <p className="text-[10px] text-muted/70 mt-1 leading-relaxed">
                  We'll text the number below when notable events happen.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    twilio_manager_alerts_enabled: !settings.twilio_manager_alerts_enabled,
                  })
                }
                aria-pressed={!!settings.twilio_manager_alerts_enabled}
                className={cn(
                  "shrink-0 w-11 h-6 rounded-full transition-colors relative",
                  settings.twilio_manager_alerts_enabled ? "bg-brand" : "bg-black/15",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow",
                    settings.twilio_manager_alerts_enabled ? "left-5" : "left-0.5",
                  )}
                />
              </button>
            </div>

            {settings.twilio_manager_alerts_enabled && (
              <div className="space-y-1.5">
                <label
                  htmlFor="manager-alert-number"
                  className="text-[9px] uppercase tracking-[0.3em] text-muted/70"
                >
                  Your phone number
                </label>
                <input
                  id="manager-alert-number"
                  type="tel"
                  value={settings.twilio_manager_alert_number || ""}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      twilio_manager_alert_number: e.target.value,
                    })
                  }
                  placeholder="+1 555 555 0100"
                  className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                />
                <p className="text-[10px] text-muted/60 leading-relaxed">
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
