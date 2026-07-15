import { Cpu, Link as LinkIcon, Loader2, MessageSquareText, Phone, RotateCw, Trash2 } from "lucide-react";

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

function Toggle({
  checked,
  onClick,
  label,
}: {
  checked: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <ShadButton
      type="button"
      variant="ghost"
      size="icon"
      disableAnimations
      onClick={onClick}
      aria-label={label}
      aria-pressed={checked}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full p-0",
        checked ? "bg-brand hover:bg-brand" : "bg-black/15",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full bg-card shadow transition-all",
          checked ? "left-5" : "left-0.5",
        )}
      />
    </ShadButton>
  );
}

export function CarrierPanel({
  settings,
  agents,
  phoneNumbers,
  carrierNumbers: _carrierNumbers,
  isSaving,
  isSyncing,
  onUpdateSettings,
  onSaveSettings,
  onSyncNumbers,
  onAddNumber: _onAddNumber,
  onDeleteNumber,
  onUpdateNumberAgent,
}: CarrierPanelProps) {
  const voiceAgents = agents.filter(
    (agent) => agent.channel === "voice" || agent.channel === "omnichannel" || !agent.channel,
  );

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto pb-4 xl:grid-cols-2">
      <Panel title="Managed call runtime" hint="RELIABLE BY DEFAULT" icon={Cpu} scroll>
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <p className="text-sm font-semibold text-foreground">Wireline manages the live-call stack</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Vapi handles the phone conversation runtime, OpenAI is the primary call model, Gemini is the automatic fallback, and Twilio supplies phone and messaging infrastructure.
            </p>
          </div>

          <dl className="grid gap-2 sm:grid-cols-2">
            {[
              ["Phone runtime", "Vapi"],
              ["Phone voices", "Managed Vapi voices"],
              ["Primary intelligence", "OpenAI"],
              ["Automatic fallback", "Gemini"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-background p-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-1.5">
            <label htmlFor="vapi-inbound-agent-id" className="wl-label text-foreground/55">
              Default employee for unassigned inbound calls
            </label>
            <Select
              value={settings.vapi_phone_inbound_agent_id || CARRIER_AGENT_UNSET}
              onValueChange={(value) =>
                onUpdateSettings({
                  ...settings,
                  vapi_phone_inbound_agent_id: value === CARRIER_AGENT_UNSET ? "" : value,
                })
              }
            >
              <SelectTrigger id="vapi-inbound-agent-id" className="h-auto w-full rounded-md border border-input bg-black/5 py-2 pl-3 text-sm text-foreground">
                <SelectValue placeholder="Oldest voice employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CARRIER_AGENT_UNSET}>Oldest voice employee</SelectItem>
                {voiceAgents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <AdminSaveBar
            onClick={onSaveSettings}
            isSaving={isSaving}
            label={OPS_ADMIN.saveLabels.carrier}
          />

          <details className="rounded-xl border border-border bg-background">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground">
              Developer connections
            </summary>
            <div className="space-y-5 border-t border-border p-4">
              <WebhooksManager />
              <IntakeKeysManager />
            </div>
          </details>
        </div>
      </Panel>

      <Panel title="Get a phone number" hint="LOCAL CUSTOMER LINE" icon={Phone} scroll>
        <PhoneNumberPicker onClaim={onSyncNumbers} />
      </Panel>

      <Panel title="Phone number routing" hint="WHO ANSWERS EACH LINE" icon={Phone} scroll>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-muted-foreground">
              Assign each customer line to one AI employee. Add campaign labels only when attribution is useful.
            </p>
            <ShadButton
              type="button"
              onClick={onSyncNumbers}
              disabled={isSyncing}
              variant="outline"
              className="h-auto shrink-0 gap-1.5 px-2 py-1"
            >
              {isSyncing ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
              Sync
            </ShadButton>
          </div>

          {phoneNumbers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-8 text-center">
              <p className="text-sm font-semibold text-foreground">No active customer lines</p>
              <p className="mt-1 text-xs text-muted-foreground">Claim a number above when the employee is ready.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {phoneNumbers.map((number) => (
                <div key={number.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold tabular-nums text-foreground">
                        {number.phone_number}
                      </p>
                      <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                        {number.vapi_number_id || "Managed number"}
                      </p>
                    </div>
                    <Input
                      type="text"
                      defaultValue={number.campaign_label || ""}
                      placeholder="Campaign label"
                      onBlur={async (event) => {
                        const next = event.target.value.trim();
                        if (next === (number.campaign_label || "")) return;
                        try {
                          const { authFetch } = await import("../../lib/api");
                          await authFetch(`/api/phone-numbers/${number.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ campaign_label: next }),
                          });
                          number.campaign_label = next;
                        } catch {
                          // The server remains the source of truth; a later sync restores the saved value.
                        }
                      }}
                      className="h-auto min-w-[180px] rounded-md border border-input bg-muted px-2.5 py-1.5 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <LinkIcon className="size-3 shrink-0 text-primary" aria-hidden="true" />
                      <Select
                        value={number.agent_id || CARRIER_AGENT_UNSET}
                        onValueChange={(value) =>
                          onUpdateNumberAgent(
                            number.id,
                            value === CARRIER_AGENT_UNSET ? "" : value,
                          )
                        }
                      >
                        <SelectTrigger
                          aria-label={`Assign employee to ${number.phone_number}`}
                          className="h-auto min-w-[150px] rounded-md border border-input bg-black/5 py-1.5 pl-2.5 text-xs text-foreground"
                        >
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={CARRIER_AGENT_UNSET}>Unassigned</SelectItem>
                          {voiceAgents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <ShadButton
                        type="button"
                        aria-label={`Delete ${number.phone_number}`}
                        onClick={() => onDeleteNumber(number.id)}
                        variant="outline"
                        className="size-8 rounded-full border-input p-0 text-muted-foreground hover:border-rose-500/30 hover:text-rose-500"
                      >
                        <Trash2 className="size-3.5" />
                      </ShadButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Text messaging" hint="FOLLOW-UP · ALERTS" icon={MessageSquareText} scroll>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Customer follow-up by text</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Enables outbound SMS while Wireline tracks replies and opt-outs.
              </p>
            </div>
            <Toggle
              checked={Boolean(settings.twilio_messaging_enabled)}
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  twilio_messaging_enabled: !settings.twilio_messaging_enabled,
                })
              }
              label="Toggle customer follow-up by text"
            />
          </div>

          {settings.twilio_messaging_enabled ? (
            <div className="grid gap-3">
              <label className="grid gap-1.5" htmlFor="twilio-sms-from">
                <span className="wl-label text-foreground/55">SMS sender number</span>
                <Input
                  id="twilio-sms-from"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={settings.twilio_sms_from_number || ""}
                  onChange={(event) =>
                    onUpdateSettings({ ...settings, twilio_sms_from_number: event.target.value })
                  }
                  placeholder="+1 800 555 0100"
                  className="h-auto w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm"
                />
              </label>
              <label className="grid gap-1.5" htmlFor="twilio-messaging-sid">
                <span className="wl-label text-foreground/55">Messaging Service SID</span>
                <Input
                  id="twilio-messaging-sid"
                  value={settings.twilio_messaging_service_sid || ""}
                  onChange={(event) =>
                    onUpdateSettings({
                      ...settings,
                      twilio_messaging_service_sid: event.target.value,
                    })
                  }
                  placeholder="MG••••••••••••••••••••••••••••••••"
                  className="h-auto w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm"
                />
              </label>
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Important-event alerts to you</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Text the account holder for hot leads, bookings, and human handoffs.
              </p>
            </div>
            <Toggle
              checked={Boolean(settings.twilio_manager_alerts_enabled)}
              onClick={() =>
                onUpdateSettings({
                  ...settings,
                  twilio_manager_alerts_enabled: !settings.twilio_manager_alerts_enabled,
                })
              }
              label="Toggle important-event alerts"
            />
          </div>

          {settings.twilio_manager_alerts_enabled ? (
            <label className="grid gap-1.5" htmlFor="manager-alert-number">
              <span className="wl-label text-foreground/55">Your alert number</span>
              <Input
                id="manager-alert-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={settings.twilio_manager_alert_number || ""}
                onChange={(event) =>
                  onUpdateSettings({
                    ...settings,
                    twilio_manager_alert_number: event.target.value,
                  })
                }
                placeholder="+1 555 555 0100"
                className="h-auto w-full rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm"
              />
            </label>
          ) : null}

          {settings.byoc_enabled ? (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
              BYOC inbound SMS webhook: <code className="break-all text-foreground">https://trywireline.com/api/twilio-webhook/sms</code>
            </div>
          ) : null}

          <AdminSaveBar
            onClick={onSaveSettings}
            isSaving={isSaving}
            label={OPS_ADMIN.saveLabels.carrierMessaging}
            fullWidth
          />
        </div>
      </Panel>
    </div>
  );
}
