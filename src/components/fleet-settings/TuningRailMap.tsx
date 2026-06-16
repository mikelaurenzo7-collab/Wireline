/* eslint-disable @typescript-eslint/no-explicit-any -- selectedAgent / agentConfig
 * are the heterogeneous snake_case JSON rows from /api/agents and the per-agent
 * config endpoints, mirrored from FleetSettings. Shared client types belong in
 * contracts/api-types.ts and are tracked separately. */
import {
  BadgeCheck,
  Brain,
  CheckCircle2,
  Mic2,
  Phone,
  PlugZap,
  ShieldCheck,
  Sparkles,
  UserRound,
  Mic,
  Workflow,
  PlayCircle,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { computeAgentReadiness } from "./agent-readiness";
import type { AccountType } from "../../lib/account-type";

type TuningRailMapProps = {
  selectedAgent: any | null;
  agentConfig: any;
  integrationStatus: Record<string, { connected: boolean }> | null;
  accountType?: AccountType;
};

// Sections a Personal account sees — a calm, essentials-only setup. The number
// is optional (personal assistants are reached via the phone widget / Siri /
// routing a live call), and there's no fleet/CRM/compliance surface.
const PERSONAL_SECTION_IDS = new Set(["identity", "voice", "knowledge", "phone", "launch"]);
// On Personal, the number is optional rather than a launch requirement, so it
// never shows a "needs setup" nag.
const PERSONAL_OPTIONAL_IDS = new Set(["phone"]);

// Unified Tuning Rail sections (Studio consolidation 2026-06).
// Training surfaces (Pronunciation, Flow, Simulator) now live here alongside
// Identity / Voice / Knowledge — one rail, one workspace. This compact index is
// a scannable table-of-contents + live readiness map; the detailed controls for
// each section render in AgentConfigPanel directly below it.
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
    hint: "Dedicated line, transfer number, routing, and fallback.",
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
    hint: "Website, FAQs, documents, policies, and product facts.",
  },
  {
    id: "pronunciation",
    label: "Pronunciation",
    icon: Mic,
    hint: "Custom pronunciations, phonetics, brand names, jargon.",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: PlugZap,
    hint: "CRM, calendar, email, SMS, Slack, Shopify, role tools.",
  },
  {
    id: "rules",
    label: "Rules",
    icon: ShieldCheck,
    hint: "Escalation, compliance, do-not-say, approvals, handoffs.",
  },
  {
    id: "flow",
    label: "Conversation Flow",
    icon: Workflow,
    hint: "Dialog trees, intent handling, escalation paths.",
  },
  {
    id: "simulator",
    label: "Simulator",
    icon: PlayCircle,
    hint: "Test calls, dry runs, scenario validation.",
  },
  {
    id: "launch",
    label: "Launch Checklist",
    icon: CheckCircle2,
    hint: "Readiness gate before the agent goes live.",
  },
] as const;

export default function TuningRailMap({
  selectedAgent,
  agentConfig,
  integrationStatus,
  accountType = "business",
}: TuningRailMapProps) {
  const isPersonal = accountType === "personal";
  // Readiness is computed by the shared helper so the rail's X/Y score and the
  // center canvas readiness ribbon can never disagree. The personal gate is
  // shorter (no number / CRM requirement).
  const {
    score: launchScore,
    total,
    checks,
    flags,
    ready,
  } = computeAgentReadiness(selectedAgent, agentConfig, integrationStatus, { accountType });
  const { hasAgent, hasVoice, hasPhone, hasKnowledge, hasRules, connectedIntegrations } = flags;

  // Live status per section — "done" lights the brand dot, "todo" shows a hollow
  // ring, and "none" (informational or optional sections) shows nothing. This
  // folds the old signal-tile grid into the index itself so the rail stays
  // compact.
  const statusFor: Record<string, "done" | "todo" | "none"> = {
    identity: hasAgent ? "done" : "todo",
    role: "none",
    phone: isPersonal ? "none" : hasPhone ? "done" : "todo",
    voice: hasVoice ? "done" : "todo",
    knowledge: hasKnowledge ? "done" : "todo",
    pronunciation: "none",
    integrations: connectedIntegrations > 0 ? "done" : "todo",
    rules: hasRules ? "done" : "todo",
    flow: "none",
    simulator: "none",
    launch: ready ? "done" : "todo",
  };

  const visibleSections = isPersonal
    ? sections.filter((s) => PERSONAL_SECTION_IDS.has(s.id))
    : sections;

  return (
    <div className="shrink-0 border-b border-border/80 bg-paper/75 px-3 py-3 dark:bg-velvet/45">
      {/* Readiness header — the one number that matters + a calm progress bar. */}
      <div className="rounded-md border border-brand/15 bg-brand/[0.04] px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <span className="wl-label text-brand tracking-[0.18em]">
              {isPersonal ? "Setup" : "Build index"}
            </span>
          </span>
          <span className="shrink-0 rounded-full border border-brand/20 bg-brand/10 px-2 py-0.5 font-mono text-[11px] tabular-nums text-brand">
            {launchScore}/{total} ready
          </span>
        </div>
        <div
          className="mt-2 flex items-center gap-1"
          role="img"
          aria-label={`${launchScore} of ${total} launch checks complete`}
        >
          {checks.map((c) => (
            <span
              key={c.id}
              className={cn("h-1 flex-1 rounded-full", c.done ? "bg-brand" : "bg-ink/[0.1]")}
            />
          ))}
        </div>
      </div>

      {/* Section index — a tight, scannable map of everything you can tune, each
          row carrying its live readiness state. */}
      <ul className="mt-3 grid grid-cols-2 gap-1.5">
        {visibleSections.map((section) => {
          const Icon = section.icon;
          const status = statusFor[section.id] ?? "none";
          const featured = "featured" in section && section.featured;
          const optional = isPersonal && PERSONAL_OPTIONAL_IDS.has(section.id);
          return (
            <li
              key={section.id}
              title={section.hint}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-2.5 py-2 transition-colors",
                featured
                  ? "border-brand/25 bg-brand/[0.07]"
                  : "border-border/80 bg-background/45 hover:border-brand/25",
              )}
            >
              <Icon className="h-3 w-3 shrink-0 text-brand" />
              <span className="wl-label flex-1 truncate text-ink">
                {optional ? "Number" : section.label}
              </span>
              {optional ? (
                <span className="wl-label-muted shrink-0 normal-case tracking-normal text-[10px]">
                  optional
                </span>
              ) : status !== "none" ? (
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    status === "done" ? "bg-brand" : "bg-ink/10 ring-1 ring-ink/15",
                  )}
                  aria-label={status === "done" ? "ready" : "needs setup"}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
