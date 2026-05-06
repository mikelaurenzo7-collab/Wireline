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
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="shrink-0 flex items-end justify-between gap-6 pb-4 mb-4 border-b border-white/10"
      >
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[9px] uppercase tracking-[0.48em] text-muted/80 mb-2 truncate">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display italic text-3xl md:text-4xl lg:text-5xl leading-[0.92] tracking-tight text-ink truncate">
            <span className="text-aurora">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-[11px] text-muted/80 mt-2 truncate max-w-2xl leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="shrink-0 flex items-center gap-2">{actions}</div>
        )}
      </motion.header>

      {/* Tab strip */}
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5 mb-4 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = tab.id === activeId;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full transition-all border text-[11px] uppercase tracking-[0.24em]",
                  active
                    ? "bg-white/10 border-brand/50 text-ink ring-aurora shadow-lg"
                    : "bg-transparent border-white/8 text-muted hover:text-ink hover:border-white/25"
                )}
              >
                {Icon && <Icon className={cn("w-3.5 h-3.5", active ? "text-brand" : "")} />}
                <span>{tab.label}</span>
                {tab.badge != null && tab.badge !== 0 && (
                  <span className={cn(
                    "ml-1 px-2 py-0.5 rounded-full text-[9px] font-mono leading-none",
                    active ? "bg-brand/25 text-brand" : "bg-white/8 text-muted"
                  )}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Body — bounded, never scrolls itself */}
      <div className={cn("flex-1 min-h-0 overflow-hidden", bodyClassName)}>
        {tabs && activeTab ? (
          <motion.div
            key={activeTab.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
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
}

export function Panel({
  title, hint, actions, icon: Icon, scroll = false, children,
  className, bodyClassName, flush = false,
}: PanelProps) {
  return (
    <section
      className={cn(
        "relative rounded-2xl glass border border-white/10 flex flex-col h-full min-h-0 overflow-hidden shadow-2xl",
        className
      )}
      style={{
        boxShadow: "0 1px 0 rgba(255, 255, 255, 0.08) inset, 0 0 0 1px rgba(125, 249, 255, 0.04), 0 20px 60px -20px rgba(0, 0, 0, 0.7), 0 8px 24px -8px rgba(125, 249, 255, 0.15)"
      }}
    >
      {(title || actions) && (
        <header className="shrink-0 px-4 py-3 flex items-center justify-between gap-3 border-b border-white/10">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="w-8 h-8 rounded-lg glass border border-white/12 flex items-center justify-center text-brand shrink-0">
                <Icon className="w-4 h-4" />
              </div>
            )}
            {title && (
              <h3 className="font-display italic text-base md:text-lg text-ink leading-none truncate">
                {title}
              </h3>
            )}
            {hint && (
              <span className="text-[9px] uppercase tracking-[0.32em] text-muted/70 truncate ml-1">
                {hint}
              </span>
            )}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div
        className={cn(
          "flex-1 min-h-0",
          scroll ? "overflow-y-auto" : "overflow-hidden",
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
  label, value, sub, icon: Icon, accent = "#7DF9FF",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="relative rounded-xl glass border border-white/10 p-4 overflow-hidden shadow-lg">
      <div
        className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-30 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      <div className="relative flex items-start justify-between mb-2.5">
        <p className="text-[9px] uppercase tracking-[0.32em] text-muted font-medium">{label}</p>
        {Icon && (
          <div className="w-7 h-7 rounded-lg glass border border-white/12 flex items-center justify-center" style={{ color: accent }}>
            <Icon className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
      <div className="font-display italic text-2xl md:text-3xl lg:text-4xl text-ink leading-none tracking-tight truncate">
        {value}
      </div>
      {sub && (
        <p className="text-[9px] uppercase tracking-[0.32em] text-muted mt-2 truncate">{sub}</p>
      )}
    </div>
  );
}
