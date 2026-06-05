/**
 * Director capability catalog — grouped matrix of what the wingman can do.
 * Used in empty state and composer popover so operators discover gen + execute paths.
 */
import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  FileText,
  Megaphone,
  Palette,
  Plug,
  Search,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  DIRECTOR_CAPABILITY_CATALOG,
  WL_DIRECTOR_CLASSES,
  type DirectorCapabilityCategory,
  type DirectorCapabilityItem,
  directorCapabilitiesByCategory,
} from "../../lib/wireline-director-design";

const CATEGORY_ICON: Record<DirectorCapabilityCategory, React.ElementType> = {
  strategy: BarChart3,
  create: FileText,
  execute: Megaphone,
  research: Search,
  integrations: Plug,
  coach: Bot,
  creative: Palette,
};

export interface DirectorCapabilityCatalogProps {
  onPickExample: (text: string) => void;
  /** empty = hero embed; popover = composer dropdown */
  variant?: "empty" | "popover";
  className?: string;
}

function CapabilityRow({
  item,
  onPick,
  compact,
}: {
  item: DirectorCapabilityItem;
  onPick: (text: string) => void;
  compact?: boolean;
}) {
  return (
    <ShadButton
      type="button"
      variant="ghost"
      disableAnimations
      onClick={() => onPick(item.example)}
      className={cn(
        "group w-full h-auto justify-start text-left rounded-md border border-transparent hover:border-brand/20 hover:bg-brand/[0.04] px-2.5 py-2 gap-2",
        compact && "py-1.5",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-ink leading-snug">{item.label}</p>
        {!compact && (
          <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {item.description}
          </p>
        )}
      </div>
      <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/40 group-hover:text-brand transition-colors" />
    </ShadButton>
  );
}

export function DirectorCapabilityCatalog({
  onPickExample,
  variant = "empty",
  className,
}: DirectorCapabilityCatalogProps) {
  const grouped = useMemo(() => directorCapabilitiesByCategory(), []);
  const categories = Object.keys(
    DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  ) as DirectorCapabilityCategory[];
  const [activeCategory, setActiveCategory] = useState<DirectorCapabilityCategory>("strategy");

  if (variant === "popover") {
    const activeItems = grouped[activeCategory] ?? [];
    return (
      <div className={cn("max-h-[min(220px,32dvh)] overflow-y-auto", className)}>
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            Skills
          </span>
          <span className="text-[9px] font-mono text-muted-foreground/70 tabular-nums">
            {DIRECTOR_CAPABILITY_CATALOG.length} total
          </span>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-none -mx-0.5 px-0.5">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICON[cat];
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                aria-pressed={isActive}
                aria-label={`${DIRECTOR_CAPABILITY_CATEGORY_LABELS[cat]} capabilities, ${items.length} skills`}
                className={cn(
                  WL_DIRECTOR_CLASSES.capabilityCatPill,
                  isActive && "wl-director-cap-pill--active",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 focus-visible:ring-offset-1",
                )}
              >
                <Icon className="w-3 h-3 shrink-0" aria-hidden />
                {DIRECTOR_CAPABILITY_CATEGORY_LABELS[cat]}
                <span className="font-mono opacity-60">{items.length}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-0.5 px-0.5">
          {activeItems.map((item) => (
            <CapabilityRow key={item.id} item={item} onPick={onPickExample} compact />
          ))}
        </div>
      </div>
    );
  }

  const featured = categories.flatMap((cat) => grouped[cat].slice(0, 1));

  return (
    <div className={cn("w-full max-w-lg", className)}>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {featured.map((item) => {
          const Icon = CATEGORY_ICON[item.category];
          return (
            <ShadButton
              key={item.id}
              type="button"
              variant="outline"
              size="sm"
              disableAnimations
              onClick={() => onPickExample(item.example)}
              className={cn(
                "group h-auto text-left items-start gap-2 px-3 py-2.5 rounded-md border-border/80",
                "hover:border-brand/25 hover:bg-brand/[0.03]",
              )}
            >
              <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold text-ink leading-snug">
                  {item.label}
                </span>
                <span className="block text-[10px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                  {item.description}
                </span>
              </span>
            </ShadButton>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground/80 leading-relaxed">
        Strategy, documents, outbound comms, live research, integrations, agent coaching, and brand
        generation — all approvable from this thread.
      </p>
    </div>
  );
}
