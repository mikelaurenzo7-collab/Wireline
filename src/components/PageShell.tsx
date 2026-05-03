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
        className="shrink-0 flex items-end justify-between gap-6 pb-3 mb-3 border-b border-white/8"
      >
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[9px] uppercase tracking-[0.45em] text-muted/80 mb-1.5 truncate">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display italic lowercase text-3xl md:text-4xl leading-[0.95] tracking-tight text-ink truncate">
            <span className="text-aurora">{title}</span>
          </h1>
          {subtitle && (
            <p className="text-[11px] text-muted/80 mt-1 truncate max-w-2xl">
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
        <div className="shrink-0 flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = tab.id === activeId;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all border text-[11px] uppercase tracking-[0.22em]",
                  active
                    ? "bg-white/8 border-brand/40 text-ink ring-aurora"
                    : "bg-transparent border-white/8 text-muted hover:text-ink hover:border-white/20"
                )}
              >
                {Icon && <Icon className={cn("w-3.5 h-3.5", active ? "text-brand" : "")} />}
                <span>{tab.label}</span>
                {tab.badge != null && tab.badge !== 0 && (
                  <span className={cn(
                    "ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-mono leading-none",
                    active ? "bg-brand/20 text-brand" : "bg-white/8 text-muted"
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
        "relative rounded-2xl glass border border-white/8 flex flex-col h-full min-h-0 overflow-hidden",
        className
      )}
    >
      {(title || actions) && (
        <header className="shrink-0 px-4 py-2.5 flex items-center justify-between gap-3 border-b border-white/8">
          <div className="flex items-center gap-2 min-w-0">
            {Icon && (
              <div className="w-7 h-7 rounded-lg glass border border-white/10 flex items-center justify-center text-brand shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
            )}
            {title && (
              <h3 className="font-display italic lowercase text-base text-ink leading-none truncate">
                {title}
              </h3>
            )}
            {hint && (
              <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 truncate ml-1">
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
          scroll ? "overflow-y-auto scrollbar-hide" : "overflow-hidden",
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
    <div className="relative rounded-xl glass border border-white/8 p-3 overflow-hidden">
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full opacity-25 blur-2xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      <div className="relative flex items-start justify-between mb-2">
        <p className="text-[9px] uppercase tracking-[0.28em] text-muted">{label}</p>
        {Icon && (
          <div className="w-6 h-6 rounded-md glass border border-white/10 flex items-center justify-center" style={{ color: accent }}>
            <Icon className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="font-display italic text-2xl md:text-3xl text-ink leading-none tracking-tight truncate">
        {value}
      </div>
      {sub && (
        <p className="text-[9px] uppercase tracking-[0.28em] text-muted mt-1.5 truncate">{sub}</p>
      )}
    </div>
  );
}
