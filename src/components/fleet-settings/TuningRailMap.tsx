import {
  BadgeCheck,
  Brain,
  CheckCircle2,
  FileText,
  Mail,
  MessageCircle,
  Mic2,
  Phone,
  PlugZap,
  Route,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "../../lib/utils";

type TuningRailMapProps = {
  selectedAgent: any | null;
  agentConfig: any;
  integrationStatus: Record<string, { connected: boolean }> | null;
};

const sections = [
  {
    id: "identity",
    label: "Identity",
    icon: UserRound,
    hint: "Name, channel, public persona, owner-facing ID.",
  },
  {
    id: "role",
    label: "Role",
    icon: BadgeCheck,
    hint: "Job, responsibilities, scope, and success criteria.",
  },
  {
    id: "phone",
    label: "Phone Number",
    icon: Phone,
    hint: "Dedicated line, transfer number, routing, and fallback behavior.",
  },
  {
    id: "voice",
    label: "Voice",
    icon: Mic2,
    hint: "Voice, speed, silence, greeting, tone, and call feel.",
    featured: true,
  },
  {
    id: "knowledge",
    label: "Knowledge",
    icon: Brain,
    hint: "Website, FAQs, documents, policies, and product/service facts.",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: PlugZap,
    hint: "CRM, calendar, email, SMS, Slack, Shopify, and role tools.",
  },
  {
    id: "rules",
    label: "Rules",
    icon: ShieldCheck,
    hint: "Escalation, compliance, do-not-say, approvals, and handoffs.",
  },
  {
    id: "launch",
    label: "Launch Checklist",
    icon: CheckCircle2,
    hint: "Readiness gate before the agent goes live.",
  },
] as const;

const voiceTuningIdeas = [
  "Opening line",
  "Silence timeout",
  "Interruption style",
  "Speaking speed",
  "Empathy level",
  "Objection tone",
  "Transfer phrase",
  "Compliance phrasing",
] as const;

export default function TuningRailMap({
  selectedAgent,
  agentConfig,
  integrationStatus,
}: TuningRailMapProps) {
  const hasAgent = !!selectedAgent;
  const hasVoice = !!selectedAgent?.voice_id || selectedAgent?.channel === "email";
  const hasPhone = !!selectedAgent?.phone_number || !!selectedAgent?.transfer_phone;
  const hasKnowledge = !!selectedAgent?.website_url || (agentConfig?.knowledge?.length ?? 0) > 0;
  const hasRules = (agentConfig?.directives?.length ?? 0) > 0 || !!agentConfig?.personality;
  const connectedIntegrations = Object.values(integrationStatus ?? {}).filter((item) => item.connected).length;
  const launchScore = [hasAgent, hasVoice, hasPhone, hasKnowledge, hasRules, connectedIntegrations > 0].filter(
    Boolean,
  ).length;

  return (
    <div className="shrink-0 border-b border-border/80 bg-paper/75 dark:bg-velvet/45 px-3 py-3 space-y-3">
      <div className="rounded-md border border-brand/15 bg-brand/[0.04] px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="wl-label text-brand tracking-[0.18em]">Agent tuning map</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Voice-first setup for building an AI employee: identity, phone, voice, knowledge,
              tools, rules, and final launch readiness.
            </p>
          </div>
          <div className="shrink-0 rounded-full border border-brand/20 bg-brand/10 px-2 py-1 text-[10px] font-mono tabular-nums text-brand">
            {launchScore}/6 ready
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              className={cn(
                "rounded-md border px-2.5 py-2 transition-colors",
                section.featured
                  ? "border-brand/25 bg-brand/[0.07]"
                  : "border-border/80 bg-background/45 hover:border-brand/20",
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon className="w-3 h-3 shrink-0 text-brand" />
                <span className="wl-label text-ink truncate">{section.label}</span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-muted line-clamp-2">{section.hint}</p>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-border/80 bg-background/50 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 wl-label text-brand">
            <Sparkles className="w-3 h-3" /> Voice lab
          </span>
          <span className="text-[10px] text-muted">primary surface</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {voiceTuningIdeas.map((idea) => (
            <span
              key={idea}
              className="rounded-full border border-brand/15 bg-brand/[0.045] px-2 py-1 text-[10px] leading-none text-ink/75"
            >
              {idea}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <SignalTile icon={Phone} label="Voice" value={hasVoice ? "armed" : "needs setup"} active={hasVoice} />
        <SignalTile icon={MessageCircle} label="SMS" value="routing" active={!!selectedAgent?.sms_enabled} />
        <SignalTile icon={Mail} label="Email" value="relay" active={selectedAgent?.channel === "email"} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        <SignalTile icon={FileText} label="Knowledge" value={hasKnowledge ? "loaded" : "empty"} active={hasKnowledge} />
        <SignalTile
          icon={PlugZap}
          label="Tools"
          value={connectedIntegrations > 0 ? `${connectedIntegrations} connected` : "not connected"}
          active={connectedIntegrations > 0}
        />
        <SignalTile icon={ShieldCheck} label="Rules" value={hasRules ? "defined" : "draft"} active={hasRules} />
        <SignalTile icon={Route} label="Launch" value={launchScore >= 5 ? "close" : "building"} active={launchScore >= 5} />
      </div>
    </div>
  );
}

function SignalTile({
  icon: Icon,
  label,
  value,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 bg-background/45",
        active ? "border-brand/25 text-ink" : "border-border/70 text-muted",
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon className={cn("w-2.5 h-2.5", active ? "text-brand" : "text-muted")} />
        <span className="wl-label leading-none">{label}</span>
      </div>
      <p className="mt-1 font-mono tabular-nums uppercase tracking-[0.08em]">{value}</p>
    </div>
  );
}
