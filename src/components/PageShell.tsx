import React, { ReactNode, useState } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   PageShell — viewport-fit page primitive.

   Every route slots into this. The shell guarantees:
     • outer container is exactly the height of the content viewport,
     • the page itself NEVER scrolls,
     • optional tab bar splits content into sub-views,
     • a single bounded scroll region is allowed inside Panel children
       (the only place a scrollbar may legitimately appear).

   Use it like:

     <PageShell
       title="Voice Archive"
       subtitle="Carrier signal threads"
       eyebrow="Signal · Archive"
       actions={<button>…</button>}
       tabs={[
         { id: "live",  label: "Live",     content: <LivePanel /> },
         { id: "past",  label: "Archive",  content: <ArchivePanel /> },
       ]}
     />
   ────────────────────────────────────────────────────────────────────────── */

export type PageShellTab = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  content: ReactNode;
};

interface PageShellProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  tabs?: PageShellTab[];
  /** Body content used when `tabs` is not provided. */
  children?: ReactNode;
  /** Initial tab id; defaults to first tab. */
  defaultTab?: string;
  /** Optional className applied to the body region. */
  bodyClassName?: string;
}

export default function PageShell({
  title, subtitle, eyebrow, actions, tabs, children, defaultTab, bodyClassName,
}: PageShellProps) {
  const [activeId, setActiveId] = useState<string>(
    defaultTab ?? (tabs && tabs.length > 0 ? tabs[0].id : "")
  );
  const activeTab = tabs?.find(t => t.id === activeId) ?? tabs?.[0];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <motion.header
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 pb-3 sm:pb-5 mb-1"
      >
        {/* eyebrow + actions row — stacks on mobile so action buttons
            don't get squeezed against the title or fall off-canvas. */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-6 mb-3">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <div className="flex items-center gap-2 mb-2 sm:mb-2.5">
                <span className="hero-accent-line shrink-0" />
                <p className="text-[9px] uppercase tracking-[0.52em] text-muted/70 truncate">
                  {eyebrow}
                </p>
              </div>
            )}
            <h1 className="font-display italic leading-[0.88] tracking-tight text-ink truncate"
              // Smaller floor on phones; the original 2rem was too tall to
              // share a line with mobile-header buttons on narrow screens.
              style={{ fontSize: "clamp(1.6rem, 6vw, 3.25rem)" }}
            >
              <span className="text-aurora">{title}</span>
            </h1>
            {subtitle && (
              <p className="text-[11px] text-muted/70 mt-2 sm:mt-2.5 max-w-2xl leading-relaxed line-clamp-2 sm:truncate">
                {subtitle}
              </p>
            )}
          </div>

          {actions && (
            <div className="shrink-0 flex flex-wrap items-center gap-2 sm:pt-1">{actions}</div>
          )}
        </div>

        {/* Gradient separator line */}
        <div className="h-px" style={{
          background: "linear-gradient(90deg, rgba(10,200,212,0.20) 0%, rgba(155,89,245,0.15) 40%, rgba(224,64,192,0.10) 70%, transparent 100%)"
        }} />
      </motion.header>

      {/* Tab strip */}
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 mb-4 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1 p-1 rounded-2xl glass border border-black/8">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  className={cn(
                    "relative shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl transition-all text-[10px] uppercase tracking-[0.22em] font-medium",
                    active
                      ? "text-white"
                      : "text-muted hover:text-ink hover:bg-black/5"
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-active-bg"
                      className="absolute inset-0 rounded-xl"
                      style={{
                        background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 55%, #E040C0 100%)",
                        boxShadow: "0 3px 12px -6px rgba(10,200,212,0.50), 0 0 0 1px rgba(255,255,255,0.18) inset"
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {Icon && <Icon className="w-3 h-3" />}
                    {tab.label}
                    {tab.badge != null && tab.badge !== 0 && (
                      <span className={cn(
                        "ml-0.5 px-1.5 py-px rounded-full text-[8px] font-mono leading-none",
                        active ? "bg-white/20 text-white" : "bg-black/8 text-muted"
                      )}>
                        {tab.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Body — bounded, never scrolls itself */}
      <div className={cn("flex-1 min-h-0 overflow-hidden", bodyClassName)}>
        {tabs && activeTab ? (
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full"
          >
            {activeTab.content}
          </motion.div>
        ) : children}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Panel — a bounded card for use inside PageShell. Optional internal scroll.
   Scrolling inside Panel is the ONLY permitted scroll surface in the app.
   ────────────────────────────────────────────────────────────────────────── */

interface PanelProps {
  title?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Whether the body should permit internal scroll (lists). Default false. */
  scroll?: boolean;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Render the body without padding (e.g. tables/audio). */
  flush?: boolean;
  /** Accent color for the icon bg glow. */
  accent?: string;
}

export function Panel({
  title, hint, actions, icon: Icon, scroll = false, children,
  className, bodyClassName, flush = false, accent = "#0AC8D4",
}: PanelProps) {
  return (
    <section
      className={cn(
        "relative rounded-2xl glass border border-black/8 flex flex-col h-full min-h-0 overflow-hidden",
        className
      )}
      style={{
        boxShadow: "0 1px 0 rgba(255,255,255,0.80) inset, 0 0 0 1px rgba(10,200,212,0.03), 0 8px 32px -10px rgba(0,0,0,0.10), 0 3px 12px -4px rgba(10,200,212,0.06)"
      }}
    >
      {/* Subtle ambient glow behind header */}
      {Icon && (
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none opacity-20 blur-3xl"
          style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
        />
      )}

      {(title || actions) && (
        <header className="relative shrink-0 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-black/8"
                style={{
                  background: `linear-gradient(135deg, ${accent}18, ${accent}06)`,
                  color: accent,
                  boxShadow: `0 0 10px ${accent}20`
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            )}
            {title && (
              <h3 className="font-display italic text-base text-ink leading-none truncate">
                {title}
              </h3>
            )}
            {hint && (
              <span className="text-[9px] uppercase tracking-[0.30em] text-muted/60 truncate ml-1">
                {hint}
              </span>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}

      {/* Header separator */}
      {(title || actions) && (
        <div className="shrink-0 mx-4 h-px" style={{
          background: "linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.07) 40%, rgba(0,0,0,0.03))"
        }} />
      )}

      <div
        className={cn(
          "flex-1 min-h-0",
          scroll ? "overflow-y-auto panel-scroll" : "overflow-hidden",
          !flush && "p-4",
          bodyClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* Compact stat tile — drop-in for hero metric grids.  */
export function StatTile({
  label, value, sub, icon: Icon, accent = "#0AC8D4", trend,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
  trend?: { value: number; label?: string };
}) {
  const trendPositive = trend && trend.value >= 0;
  return (
    <div className="relative rounded-2xl glass border border-black/8 p-5 overflow-hidden card-interactive">
      {/* Ambient glow */}
      <div
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      {/* Bottom gradient line */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[9px] uppercase tracking-[0.38em] text-muted font-medium leading-none">
            {label}
          </p>
          {Icon && (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center border border-black/8 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${accent}18, ${accent}06)`,
                color: accent,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="font-display italic text-3xl md:text-4xl text-ink leading-none tracking-tight truncate mb-2">
          {value}
        </div>

        <div className="flex items-center gap-2">
          {sub && (
            <p className="text-[9px] uppercase tracking-[0.28em] text-muted truncate flex-1">{sub}</p>
          )}
          {trend && (
            <span className={cn(
              "shrink-0 text-[9px] font-mono font-medium",
              trendPositive ? "text-emerald-400" : "text-rose-400"
            )}>
              {trendPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
