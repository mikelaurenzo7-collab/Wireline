/* eslint-disable @typescript-eslint/no-explicit-any -- AgentConfigPanel consumes loosely typed /api/agents rows. */
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Bot,
  ChevronLeft,
  GraduationCap,
  Hash,
  Loader2,
  Mic2,
  Phone,
  Radio,
  Save,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";

import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import { useToast } from "../../contexts/ToastContext";
import AgentModelSelector from "../AgentModelSelector";
import { AGENT_ROLES, PREMIUM_VOICES, RoleBadge } from "../fleet/helpers";
import { Input } from "../ui/shadcn/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { VoiceFieldSelect, type VoiceOption } from "./VoiceSelector";

interface AgentConfigPanelProps {
  selectedAgent: any | null;
  setSelectedAgent: (agent: any) => void;
  agentConfig: any;
  setAgentConfig: (config: any) => void;
  isConfigLoading: boolean;
  fetchAgentConfig: (id: string) => Promise<void>;
  updateAgentMeta: (updates: any) => Promise<void>;
  toggleIntegrationGroup: (integration: string, enable: boolean) => Promise<void>;
  toggleAgentTool: (toolName: any) => Promise<void>;
  resetAgentToolsToRoleDefaults: () => Promise<void>;
  agentStats: Record<string, any>;
  fetchAgentPerformance: (id: string, force?: boolean) => Promise<void>;
  isApplyingTemplate: boolean;
  applyRoleTemplate: (role: string) => Promise<void>;
  integrationStatus: Record<string, { connected: boolean }> | null;
}

function numberLabel(agent: any): string {
  return agent?.phone_number || agent?.phone || "Not assigned";
}

function countRows(rows: unknown): number {
  return Array.isArray(rows) ? rows.length : 0;
}

function QuickLink({
  to,
  icon: Icon,
  title,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-md border border-ink/[0.08] bg-ink/[0.015] p-3 transition hover:border-brand/25 hover:bg-brand/[0.045]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-brand/15 bg-brand/8 text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{title}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-foreground/55 transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}

export default function AgentConfigPanel({
  selectedAgent,
  setSelectedAgent,
  agentConfig,
  isConfigLoading,
  updateAgentMeta,
  integrationStatus,
}: AgentConfigPanelProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftGreeting, setDraftGreeting] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    authFetch("/api/voices")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        setClonedVoices(
          rows.map((voice: { id: string; name?: string; provider?: string }) => ({
            id: voice.id,
            name: voice.name || "Cloned voice",
            provider: voice.provider || "11labs",
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setDraftName(selectedAgent?.name || "");
    setDraftGreeting(selectedAgent?.first_message || "");
  }, [selectedAgent?.id, selectedAgent?.name, selectedAgent?.first_message]);

  const voiceCatalog = useMemo(() => [...clonedVoices, ...PREMIUM_VOICES], [clonedVoices]);

  const commit = async (key: string, patch: Record<string, unknown>, message?: string) => {
    if (!selectedAgent) return;
    setSavingKey(key);
    try {
      await updateAgentMeta(patch);
      if (message) toastSuccess("Saved", message);
    } catch {
      toastError("Save failed", "Could not update this agent. Try again in a moment.");
    } finally {
      setSavingKey(null);
    }
  };

  const saveName = () => {
    const next = draftName.trim();
    if (!selectedAgent || !next || next === selectedAgent.name) return;
    void commit("name", { name: next }, "Agent name updated.");
  };

  const saveGreeting = () => {
    const next = draftGreeting.trim();
    if (!selectedAgent || next === (selectedAgent.first_message || "")) return;
    void commit("greeting", { first_message: next }, "Opening line updated.");
  };

  if (!selectedAgent) {
    return (
      <main className="flex-1 px-3 py-3 hidden md:block">
        <div className="flex min-h-[220px] py-8 flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-card text-muted">
            <Bot className="h-7 w-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-display text-2xl italic text-foreground">Pick an agent</h3>
            <p className="max-w-sm text-sm leading-relaxed text-muted">
              Choose an agent from the list to set up the basics. Deep training now lives on its own
              Training page.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const knowledgeCount = countRows(agentConfig?.knowledge);
  const directiveCount = countRows(agentConfig?.directives);
  const connectedIntegrations = integrationStatus
    ? Object.values(integrationStatus).filter((item) => item?.connected).length
    : 0;
  const hasNumber = numberLabel(selectedAgent) !== "Not assigned";
  const trainingHref = `/training?agent=${encodeURIComponent(selectedAgent.id)}`;

  return (
    <main className="flex-1 wl-agents-config-drawer md:overflow-visible md:h-auto md:min-h-0 px-3 py-3">
      <ShadButton
        type="button"
        variant="outline"
        size="sm"
        disableAnimations
        onClick={() => setSelectedAgent(null)}
        aria-label="Back to agent list"
        className="mb-3 h-10 rounded-full wl-label text-foreground/80 md:hidden"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to Agents
      </ShadButton>

      <div className="mx-auto max-w-[720px] space-y-3">
        <section className="rounded-md border border-brand/18 bg-brand/[0.045] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="wl-label text-brand tracking-[0.22em]">Simple setup</p>
              <h3 className="mt-1 font-display text-2xl italic text-foreground">
                Only the basics live here.
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Name the agent, choose its role, pick a voice and model, confirm the number, then
                move training and workflows to the Training page.
              </p>
            </div>
            {isConfigLoading && (
              <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin text-brand" />
            )}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink/[0.08] pb-3">
            <UserRound className="h-4 w-4 text-brand" />
            <h4 className="font-display text-xl italic text-foreground">Identity</h4>
          </div>

          <div className="space-y-2">
            <label className="wl-label text-foreground/60">Agent name</label>
            <div className="flex gap-2">
              <Input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={saveName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                }}
                className="text-base font-semibold text-foreground"
                placeholder="Jordan"
              />
              <ShadButton
                type="button"
                variant="outline"
                disableAnimations
                onClick={saveName}
                disabled={
                  !draftName.trim() ||
                  draftName.trim() === selectedAgent.name ||
                  savingKey === "name"
                }
                className="shrink-0"
              >
                {savingKey === "name" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </ShadButton>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="wl-label text-foreground/60">Role</label>
              <Select
                value={selectedAgent.role || "customer_service"}
                onValueChange={(value) =>
                  void commit("role", { role: value }, "Agent role updated.")
                }
              >
                <SelectTrigger aria-label="Agent role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AGENT_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="wl-label text-foreground/60">Channel</label>
              <Select
                value={selectedAgent.channel || "voice"}
                onValueChange={(value) =>
                  void commit("channel", { channel: value }, "Channel updated.")
                }
              >
                <SelectTrigger aria-label="Agent channel" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="voice">Voice</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="omnichannel">Omnichannel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={selectedAgent.role} size="sm" />
              <span className="inline-flex items-center gap-1 rounded-full border border-ink/[0.08] bg-card px-2 py-0.5 text-xs text-foreground/70">
                <Radio className="h-3 w-3 text-brand" /> {selectedAgent.channel || "voice"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-ink/[0.08] bg-card px-2 py-0.5 text-xs text-foreground/70">
                <Hash className="h-3 w-3 text-brand" /> {selectedAgent.id}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink/[0.08] pb-3">
            <Mic2 className="h-4 w-4 text-brand" />
            <h4 className="font-display text-xl italic text-foreground">Voice and model</h4>
          </div>

          <VoiceFieldSelect
            label="Main voice"
            value={selectedAgent.voice_id}
            catalog={voiceCatalog}
            onSelect={(voiceId, provider) =>
              void commit(
                "voice",
                {
                  voice_id: voiceId,
                  ...(voiceId && provider ? { voice_provider: provider } : {}),
                },
                "Voice updated.",
              )
            }
          />

          <AgentModelSelector
            agent={selectedAgent}
            onCommit={(patch) => void commit("model", patch, "Model updated.")}
          />
        </section>

        <section className="rounded-md border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-ink/[0.08] pb-3">
            <Phone className="h-4 w-4 text-brand" />
            <h4 className="font-display text-xl italic text-foreground">Number and opening line</h4>
          </div>

          <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="wl-label text-foreground/60">Phone number</p>
                <p
                  className={cn(
                    "mt-1 text-sm font-medium",
                    hasNumber ? "text-foreground" : "text-muted italic",
                  )}
                >
                  {numberLabel(selectedAgent)}
                </p>
              </div>
              <ShadButton type="button" variant="outline" size="sm" disableAnimations asChild>
                <Link to="/phone">Manage</Link>
              </ShadButton>
            </div>
          </div>

          <div className="space-y-2">
            <label className="wl-label text-foreground/60">Initial greeting</label>
            <textarea
              value={draftGreeting}
              onChange={(event) => setDraftGreeting(event.target.value)}
              onBlur={saveGreeting}
              placeholder="Thanks for calling. How can I help today?"
              className="min-h-[84px] w-full resize-none rounded-md border border-ink/[0.1] bg-ink/[0.025] px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition focus:border-brand/50 focus:ring-4 focus:ring-brand/10"
            />
            <div className="flex justify-end">
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                disableAnimations
                onClick={saveGreeting}
                disabled={
                  draftGreeting.trim() === (selectedAgent.first_message || "") ||
                  savingKey === "greeting"
                }
              >
                {savingKey === "greeting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save greeting
              </ShadButton>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] pb-3">
            <h4 className="font-display text-xl italic text-foreground">Training</h4>
            <GraduationCap className="h-5 w-5 text-brand" />
          </div>

          <div className="grid grid-cols-1 gap-2">
            <QuickLink
              to={`${trainingHref}&tab=database`}
              icon={BookOpen}
              title="Training sources"
            />
            <QuickLink to={`${trainingHref}&tab=flow`} icon={Workflow} title="Workflows" />
            <QuickLink to={`${trainingHref}&tab=simulator`} icon={Sparkles} title="Simulator" />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] px-2 py-2">
              <p className="font-mono text-sm font-semibold text-foreground">{knowledgeCount}</p>
              <p className="wl-label-muted">Facts</p>
            </div>
            <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] px-2 py-2">
              <p className="font-mono text-sm font-semibold text-foreground">{directiveCount}</p>
              <p className="wl-label-muted">Rules</p>
            </div>
            <div className="rounded-md border border-ink/[0.08] bg-ink/[0.015] px-2 py-2">
              <p className="font-mono text-sm font-semibold text-foreground">
                {connectedIntegrations}
              </p>
              <p className="wl-label-muted">Connected</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
