import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Cpu, Phone, Plus, KeyRound, Link as LinkIcon, RotateCw, Trash2, Loader2, ChevronRight } from "lucide-react";
import { Panel } from "../PageShell";
import WebhooksManager from "../WebhooksManager";
import IntakeKeysManager from "../IntakeKeysManager";
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

  const providerDocsUrl = {
    google: "https://ai.google.dev/gemini-api/docs/models",
    anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
  }[settings.voice_llm_provider] ?? "https://ai.google.dev/gemini-api/docs/models";

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0">
      {/* Carrier authentication */}
      <Panel title="Wireline Voice Network" hint="CALLS" icon={Cpu} scroll>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="rounded-xl glass border border-brand/30 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Voice network key</p>
              </div>
              <p className="text-[9px] uppercase tracking-[0.3em] text-brand">Managed by Wireline</p>
            </div>
            <div className={cn(
              "rounded-xl border p-3 space-y-1.5",
              (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-rose-500/10 border-rose-500/30"
            )}>
              <div className="flex items-center gap-1.5">
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse",
                  (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY ? "bg-emerald-500" : "bg-rose-500"
                )} />
                <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Browser voice key</p>
              </div>
              <p className={cn("text-[9px] uppercase tracking-[0.3em]",
                (import.meta as any).env?.VITE_VAPI_PUBLIC_KEY ? "text-emerald-500" : "text-rose-500"
              )}>
                {(import.meta as any).env?.VITE_VAPI_PUBLIC_KEY ? "Connected" : "Missing"}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vapi-phone-number-id" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Default Wireline phone number ID</label>
            <input
              id="vapi-phone-number-id"
              type="text"
              value={settings.vapi_phone_number_id}
              onChange={e => onUpdateSettings({ ...settings, vapi_phone_number_id: e.target.value })}
              className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
              placeholder="e.g. 3c7a9f…"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="vapi-inbound-agent-id" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Default inbound voice agent</label>
            <div className="relative">
              <select
                id="vapi-inbound-agent-id"
                value={settings.vapi_phone_inbound_agent_id}
                onChange={e => onUpdateSettings({ ...settings, vapi_phone_inbound_agent_id: e.target.value })}
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
              >
                <option value="">Oldest voice agent (fallback)</option>
                {agents
                  .filter(a => a.channel === "voice" || a.channel === "omnichannel" || !a.channel)
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
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
                  <span className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold group-open:text-brand transition-colors">Advanced Cognitive Routing</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted group-open:rotate-90 transition-transform" />
              </summary>
              
              <div className="mt-4 space-y-4 pl-1">
                <p className="text-[10px] text-muted leading-relaxed">
                  Wireline routes all intelligence through optimized enterprise-grade keys by default. Configure custom routing only if your organization requires specific model overrides.
                </p>
                
                <div className="rounded-2xl glass border border-white/10 p-4 space-y-3 bg-black/10">
                  <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Custom Model Selection</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      { v: "google", label: "Gemini", sub: "PLATFORM", desc: "Lowest latency cognitive bridge." },
                      { v: "anthropic", label: "Claude", sub: "PREMIUM", desc: "Advanced reasoning and steering." },
                    ].map((p) => (
                      <button
                        key={p.v}
                        type="button"
                        onClick={() => onUpdateSettings({
                          ...settings,
                          voice_llm_provider: p.v,
                          voice_llm_model: p.v === "google" ? "gemini-1.5-flash" : "claude-3-5-sonnet-20241022",
                        })}
                        className={cn(
                          "text-left rounded-xl p-3 transition-all border",
                          settings.voice_llm_provider === p.v
                            ? "bg-brand/10 border-brand/40"
                            : "bg-black/20 border-white/8 hover:border-white/30"
                        )}
                      >
                        <div className="flex items-baseline justify-between mb-0.5">
                          <span className="text-sm text-ink">{p.label}</span>
                          <span className="text-[9px] uppercase tracking-[0.3em] text-muted">{p.sub}</span>
                        </div>
                        <p className="text-[10px] text-muted/80 leading-snug">{p.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="space-y-1.5 pt-2">
                    <label htmlFor="voice-llm-model" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Model Revision Override</label>
                    <input
                      id="voice-llm-model"
                      type="text"
                      value={settings.voice_llm_model}
                      onChange={(e) => onUpdateSettings({ ...settings, voice_llm_model: e.target.value })}
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
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
              Save settings
            </button>
          </div>
        </div>
      </Panel>

      {/* Hub & routing */}
      <Panel title="Wireline Phone Numbers" hint="VOICE ROUTING" icon={Phone} scroll>
        <div className="space-y-3">
          {phoneNumbers.length === 0 ? (
            <div className="rounded-xl glass border border-white/10 border-dashed py-8 text-center">
              <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">No active lines</p>
            </div>
          ) : (
            <div className="space-y-2">
              {phoneNumbers.map(pt => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={pt.id}
                  className="rounded-xl glass border border-white/8 p-3 flex flex-col xl:flex-row xl:items-center gap-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display italic text-lg text-ink leading-none tabular-nums truncate">{pt.phone_number}</div>
                    <div className="text-[9px] uppercase tracking-[0.3em] text-muted/60 mt-1 font-mono">
                      {pt.vapi_number_id?.substring(0, 16)}…
                    </div>
                  </div>
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
                        {agents.filter(a => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel).map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
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
                {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                Sync numbers
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                type="tel"
                value={newNumber}
                onChange={e => setNewNumber(e.target.value)}
                placeholder="+1 800 555 0100"
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink tabular-nums"
              />
              <input
                type="text"
                value={newNumberVapiId}
                onChange={e => setNewNumberVapiId(e.target.value)}
                placeholder="Wireline voice number ID"
                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink font-mono"
              />
            </div>
            <button
              onClick={() => { onAddNumber(newNumber, newNumberVapiId); setNewNumber(""); setNewNumberVapiId(""); }}
              disabled={!newNumber || !newNumberVapiId}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25 transition-colors disabled:opacity-30"
            >
              <Plus className="w-3 h-3" /> Register number
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
