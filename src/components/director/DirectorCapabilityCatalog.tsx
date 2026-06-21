/**
 * Director capability catalog — grouped matrix of what the co-pilot can do.
 * Used in empty state and composer popover so account holders discover gen + execute paths.
 */
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-design-system";
import {
  DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  DIRECTOR_CAPABILITY_CATALOG,
  DirectorCapabilityCategory,
  DirectorCapabilityItem,
  directorCapabilitiesByCategory,
} from "../../lib/director-copy";
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
import { Input } from "../ui/shadcn/Input";

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
  /** Inside composer accessory — defers scroll to parent panel */
  embedded?: boolean;
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
        "group w-full h-auto justify-start text-left rounded-md border border-transparent hover:border-brand/25 hover:bg-brand/[0.04] px-2.5 py-2 gap-2 touch-press transition-all duration-150 hover:scale-[1.01] active:scale-[0.99]",
        compact && "py-1.5",
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="wl-micro-meta font-semibold text-foreground leading-snug">{item.label}</p>
        {!compact && (
          <p
            className={cn(
              WL_DIRECTOR_CLASSES.metaCaption,
              "text-muted-foreground leading-relaxed mt-0.5 line-clamp-2",
            )}
          >
            {item.description}
          </p>
        )}
      </div>
      <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/40 group-hover:text-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-200" />
    </ShadButton>
  );
}

export function DirectorCapabilityCatalog({
  onPickExample,
  variant = "empty",
  embedded = false,
  className,
}: DirectorCapabilityCatalogProps) {
  const grouped = useMemo(() => directorCapabilitiesByCategory(), []);
  const categories = Object.keys(
    DIRECTOR_CAPABILITY_CATEGORY_LABELS,
  ) as DirectorCapabilityCategory[];
  const [activeCategory, setActiveCategory] = useState<DirectorCapabilityCategory>("strategy");
  const [query, setQuery] = useState("");

  const filteredCatalog = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return DIRECTOR_CAPABILITY_CATALOG.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.example.toLowerCase().includes(q),
    );
  }, [query]);

  if (variant === "popover") {
    const activeItems = filteredCatalog ?? grouped[activeCategory] ?? [];
    return (
      <div className={cn(!embedded && "max-h-[min(220px,32dvh)] overflow-y-auto", className)}>
        {!embedded && (
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="wl-label text-muted-foreground">Skills</span>
            <span className="wl-micro-badge font-mono text-muted-foreground/70 tabular-nums">
              {filteredCatalog
                ? `${filteredCatalog.length} match`
                : `${DIRECTOR_CAPABILITY_CATALOG.length} total`}
            </span>
          </div>
        )}
        <label className="sr-only" htmlFor="director-capability-search">
          Search capabilities
        </label>
        <div className="relative px-0.5 pb-2">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60"
            aria-hidden
          />
          <Input
            id="director-capability-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="h-8 w-full py-1 pl-7 pr-2 wl-micro-meta bg-card/60 border-border/80 placeholder:text-muted-foreground/60 focus-visible:ring-brand/40"
          />
        </div>
        {!filteredCatalog && (
          <div
            className={cn(
              "flex flex-wrap gap-1 pb-2 -mx-0.5 px-0.5",
              embedded && "wl-composer-accessory-catalog-sticky",
            )}
          >
            {categories.map((cat) => {
              const Icon = CATEGORY_ICON[cat];
              const items = grouped[cat];
              if (items.length === 0) return null;
              const isActive = activeCategory === cat;
              return (
                <ShadButton
                  key={cat}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
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
                </ShadButton>
              );
            })}
          </div>
        )}
        <div className="space-y-0.5 px-0.5">
          {activeItems.length === 0 ? (
            <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "px-2 py-3 text-muted-foreground")}>
              No skills match &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            activeItems.map((item) => (
              <CapabilityRow key={item.id} item={item} onPick={onPickExample} compact />
            ))
          )}
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
              title={item.description}
              className={cn(
                "group h-auto text-left items-start gap-2 px-3 py-2.5 rounded-md border border-border/80 bg-card/50 dark:bg-velvet/40 backdrop-blur-sm",
                "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-sm hover:shadow-brand/5 hover:border-brand/25 hover:bg-brand/[0.03]",
              )}
            >
              <span className="flex w-7 h-7 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand group-hover:bg-brand group-hover:text-white transition-all duration-200">
                <Icon className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block wl-micro-meta font-semibold text-foreground leading-snug">
                  {item.label}
                </span>
                <span
                  className={cn(
                    WL_DIRECTOR_CLASSES.metaCaption,
                    "block text-muted-foreground leading-snug mt-0.5 line-clamp-3 text-pretty",
                  )}
                >
                  {item.description}
                </span>
              </span>
            </ShadButton>
          );
        })}
      </div>
      <p
        className={cn(
          WL_DIRECTOR_CLASSES.metaCaption,
          "mt-3 text-muted-foreground/80 leading-relaxed",
        )}
      >
        Strategy, documents, outbound comms, live research, integrations, agent coaching, and brand
        generation — all approvable from this thread.
      </p>
    </div>
  );
}
