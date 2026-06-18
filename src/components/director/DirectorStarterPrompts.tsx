/**
 * Director empty-state starter prompts — featured chips + expandable rest.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  DIRECTOR_EMPTY_HERO,
  DIRECTOR_STARTER_PROMPTS,
  DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  type DirectorStarterPrompt,
  WL_DIRECTOR_CLASSES,
} from "../../lib/wireline-director-design";

const STUDIO_AGENT_STARTER_PROMPTS: readonly DirectorStarterPrompt[] = [
  {
    id: "studio-name-role",
    label: "Name this agent and define its role",
    intent: "Identity, title, and job definition",
  },
  {
    id: "studio-responsibilities",
    label: "Give this agent responsibilities, boundaries, and escalation rules",
    intent: "Scope of work and handoff rules",
  },
  {
    id: "studio-phone-number",
    label: "Help me assign the right phone number and call behavior",
    intent: "Voice channel setup and routing",
  },
  {
    id: "studio-voice",
    label: "Make the voice warmer, more confident, and more concise",
    intent: "Voice personality and tone tuning",
  },
  {
    id: "studio-tools",
    label: "Connect the tools this role needs: CRM, calendar, and email",
    intent: "Role-based integrations and permissions",
  },
  {
    id: "studio-instructions",
    label: "Draft the agent instructions and behavior rules",
    intent: "Agent instructions and behavior policy",
  },
  {
    id: "studio-knowledge",
    label: "Tell me what knowledge this agent still needs before launch",
    intent: "Launch readiness and missing context",
  },
  {
    id: "studio-launch-checklist",
    label: "Build a launch checklist and fix anything missing",
    intent: "Activation checklist and quality gate",
  },
] as const;

export interface DirectorStarterPromptsProps {
  onSelect: (label: string) => void;
  prompts?: readonly DirectorStarterPrompt[];
  starterEyebrow?: string;
  featuredCount?: number;
  className?: string;
}

export function DirectorStarterPrompts({
  onSelect,
  prompts,
  starterEyebrow,
  featuredCount = DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  className,
}: DirectorStarterPromptsProps) {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const isStudioSurface =
    location.pathname === "/agents" || location.pathname.startsWith("/agents/");
  const resolvedPrompts =
    prompts ?? (isStudioSurface ? STUDIO_AGENT_STARTER_PROMPTS : DIRECTOR_STARTER_PROMPTS);
  const resolvedEyebrow =
    starterEyebrow ??
    (isStudioSurface ? "Tell the Assistant what to edit" : DIRECTOR_EMPTY_HERO.starterEyebrow);
  const featured = resolvedPrompts.slice(0, featuredCount);
  const rest = resolvedPrompts.slice(featuredCount);
  const hasMore = rest.length > 0;

  return (
    <div className={cn("wl-director-empty-section w-full", className)}>
      <p className="wl-label text-brand/60 mb-2.5">{resolvedEyebrow}</p>
      <div className="stagger-children grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {featured.map((p) => (
          <StarterChip
            key={p.id}
            label={p.label}
            intent={p.intent}
            onSelect={() => onSelect(p.label)}
          />
        ))}
        {expanded &&
          rest.map((p) => (
            <StarterChip
              key={p.id}
              label={p.label}
              intent={p.intent}
              onSelect={() => onSelect(p.label)}
            />
          ))}
      </div>
      {hasMore && (
        <ShadButton
          type="button"
          variant="ghost"
          size="sm"
          disableAnimations
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2.5 h-auto gap-1.5 px-2 py-1.5 wl-label text-muted-foreground hover:text-brand touch-press hover:scale-[1.02]"
        >
          {expanded ? DIRECTOR_EMPTY_HERO.fewerPromptsLabel : DIRECTOR_EMPTY_HERO.morePromptsLabel}
          <span className="font-mono tabular-nums text-muted-foreground/70">({rest.length})</span>
          <ChevronDown
            className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")}
            aria-hidden
          />
        </ShadButton>
      )}
    </div>
  );
}

function StarterChip({
  label,
  intent,
  onSelect,
}: {
  label: string;
  intent: string;
  onSelect: () => void;
}) {
  return (
    <ShadButton
      type="button"
      variant="outline"
      size="sm"
      disableAnimations
      title={intent}
      onClick={onSelect}
      className={cn(
        "touch-press group h-auto w-full justify-between items-start text-left wl-micro-meta text-ink/80 px-3 py-2.5 gap-2 whitespace-normal",
        "hover:shadow-sm hover:shadow-brand/5 hover:border-brand/35 hover:bg-paper/85 dark:hover:bg-velvet/60",
        "transition-all duration-300 hover:-translate-y-0.5",
        WL_DIRECTOR_CLASSES.starterChip,
      )}
    >
      <span className="min-w-0 leading-snug text-pretty">{label}</span>
      <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/50 group-hover:text-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
    </ShadButton>
  );
}
