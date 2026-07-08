/* eslint-disable @typescript-eslint/no-explicit-any -- selectedAgent / agentConfig are heterogeneous API rows. */
import { BookOpen, CheckCircle2, Cpu, Mic2, Phone, UserRound, Workflow } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { computeAgentReadiness } from "./agent-readiness";
import type { AccountType } from "../../lib/account-type";

type TuningRailMapProps = {
  selectedAgent: any | null;
  agentConfig: any;
  integrationStatus: Record<string, { connected: boolean }> | null;
  accountType?: AccountType;
};

const ESSENTIALS = [
  { id: "identity", label: "Name + role", icon: UserRound },
  { id: "voice", label: "Voice", icon: Mic2 },
  { id: "model", label: "Model", icon: Cpu },
  { id: "phone", label: "Number", icon: Phone },
  { id: "training", label: "Training", icon: BookOpen },
] as const;

function statusFor(
  id: string,
  flags: ReturnType<typeof computeAgentReadiness>["flags"],
  isPersonal: boolean,
) {
  if (id === "identity") return flags.hasAgent;
  if (id === "voice") return flags.hasVoice;
  if (id === "model") return true;
  if (id === "phone") return isPersonal || flags.hasPhone;
  if (id === "training") return flags.hasKnowledge || flags.hasRules;
  return false;
}

export default function TuningRailMap({
  selectedAgent,
  agentConfig,
  integrationStatus,
  accountType = "personal",
}: TuningRailMapProps) {
  const isPersonal = accountType === "personal";
  const { score, total, flags, ready } = computeAgentReadiness(
    selectedAgent,
    agentConfig,
    integrationStatus,
    {
      accountType,
    },
  );
  const trainingHref = selectedAgent
    ? `/training?agent=${encodeURIComponent(selectedAgent.id)}`
    : "/training";

  return (
    <div className="shrink-0 border-b border-border/80 bg-card/75 px-3 py-3 dark:bg-card/75">
      <div className="rounded-md border border-brand/15 bg-brand/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-brand" />
            <span className="wl-label text-brand tracking-[0.18em]">Setup essentials</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[var(--wireline-typography-overline-size)] tabular-nums",
              ready
                ? "border-brand/25 bg-brand/12 text-brand"
                : "border-ink/[0.08] bg-ink/[0.04] text-foreground/55",
            )}
          >
            {score}/{total} ready
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Studio stays simple: create the agent, then move knowledge, workflows, pronunciation, and
          testing into Training.
        </p>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-1.5">
        {ESSENTIALS.map((section) => {
          const Icon = section.icon;
          const done = statusFor(section.id, flags, isPersonal);
          const content = (
            <span
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
                done ? "border-brand/20 bg-brand/[0.055]" : "border-border/80 bg-background/45",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-brand" />
              <span className="wl-label flex-1 truncate text-foreground">{section.label}</span>
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  done ? "bg-brand" : "bg-ink/10 ring-1 ring-ink/15",
                )}
                aria-label={done ? "ready" : "needs setup"}
              />
            </span>
          );

          return (
            <li key={section.id}>
              {section.id === "training" ? <Link to={trainingHref}>{content}</Link> : content}
            </li>
          );
        })}
      </ul>

      <Link
        to={trainingHref}
        className="mt-3 flex items-center justify-between rounded-md border border-ink/[0.08] bg-ink/[0.015] px-3 py-2 text-xs font-medium text-foreground/70 transition hover:border-brand/25 hover:text-brand"
      >
        <span className="inline-flex items-center gap-2">
          <Workflow className="h-3.5 w-3.5 text-brand" />
          Open Training page
        </span>
        <span className="text-brand">→</span>
      </Link>
    </div>
  );
}
