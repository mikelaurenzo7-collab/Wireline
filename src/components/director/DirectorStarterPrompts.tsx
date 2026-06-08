/**
 * Director empty-state starter prompts — featured chips + expandable rest.
 */
import { useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  DIRECTOR_EMPTY_HERO,
  DIRECTOR_STARTER_PROMPTS,
  DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  WL_DIRECTOR_CLASSES,
} from "../../lib/wireline-director-design";

export interface DirectorStarterPromptsProps {
  onSelect: (label: string) => void;
  featuredCount?: number;
  className?: string;
}

export function DirectorStarterPrompts({
  onSelect,
  featuredCount = DIRECTOR_STARTER_PROMPTS_FEATURED_COUNT,
  className,
}: DirectorStarterPromptsProps) {
  const [expanded, setExpanded] = useState(false);
  const featured = DIRECTOR_STARTER_PROMPTS.slice(0, featuredCount);
  const rest = DIRECTOR_STARTER_PROMPTS.slice(featuredCount);
  const hasMore = rest.length > 0;

  return (
    <div className={cn("wl-director-empty-section w-full", className)}>
      <p className="wl-label text-brand/60 mb-2.5">{DIRECTOR_EMPTY_HERO.starterEyebrow}</p>
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
          className="mt-2.5 h-auto gap-1.5 px-2 py-1.5 wl-label text-muted-foreground hover:text-brand"
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
        "touch-press group h-auto w-full justify-between items-start text-left text-[11px] text-ink/80 px-3 py-2.5 gap-2 whitespace-normal",
        WL_DIRECTOR_CLASSES.starterChip,
      )}
    >
      <span className="min-w-0 leading-snug text-pretty">{label}</span>
      <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/50 group-hover:text-brand transition-colors" />
    </ShadButton>
  );
}
