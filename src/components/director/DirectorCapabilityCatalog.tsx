/**
 * Director capability catalog — grouped matrix of what the wingman can do.
 * Used in empty state and composer popover so operators discover gen + execute paths.
 */
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  FileText,
  Megaphone,
  Palette,
  Plug,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import {
  DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  DIRECTOR_CAPABILITY_CATALOG,
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
  const [openCategory, setOpenCategory] = useState<DirectorCapabilityCategory | null>(
    variant === "popover" ? "strategy" : null,
  );

  if (variant === "popover") {
    return (
      <div className={cn("max-h-[min(52dvh,420px)] overflow-y-auto", className)}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border mb-1 sticky top-0 bg-popover/95 backdrop-blur-sm z-10">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
            What Director can do
          </span>
          <span className="ml-auto text-[9px] font-mono text-muted-foreground/70 tabular-nums">
            {DIRECTOR_CAPABILITY_CATALOG.length} skills
          </span>
        </div>
        <div className="p-1 space-y-0.5">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICON[cat];
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isOpen = openCategory === cat;
            return (
              <div key={cat} className="rounded-md overflow-hidden">
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => setOpenCategory(isOpen ? null : cat)}
                  className="w-full h-auto justify-start gap-2 px-3 py-2 rounded-md text-[11px] font-semibold text-foreground"
                >
                  <Icon className="w-3.5 h-3.5 text-brand shrink-0" />
                  {DIRECTOR_CAPABILITY_CATEGORY_LABELS[cat]}
                  <span className="ml-auto text-[9px] font-mono text-muted-foreground">
                    {items.length}
                  </span>
                </ShadButton>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden px-1 pb-1"
                    >
                      {items.map((item) => (
                        <CapabilityRow key={item.id} item={item} onPick={onPickExample} compact />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Empty-state: show top capabilities per category in a compact grid
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
