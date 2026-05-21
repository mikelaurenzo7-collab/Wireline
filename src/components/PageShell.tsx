import React, { ReactNode, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../lib/utils";

/* ──────────────────────────────────────────────────────────────────────────
   PageShell — viewport-fit page primitive.

   Every route slots into this. The shell guarantees:
     • outer container is exactly the height of the content viewport,
     • the page itself NEVER scrolls,
     • optional tab bar splits content into sub-views,
     • a single bounded scroll region is allowed inside Panel children
       (the only place a scrollbar may legitimately appear).

   Mobile layout (< md):
     • Actions row is hidden — an ⋯ button in the tab strip opens a
       bottom sheet instead. No chrome floats above the content panel.
     • Tab strip is a flat scrollable row (no glass pill wrapper) so it
       flows flush into the Panel below — one visual unit.

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
  title: _title,
  subtitle: _subtitle,
  eyebrow: _eyebrow,
  actions,
  tabs,
  children,
  defaultTab,
  bodyClassName,
}: PageShellProps) {
  const [activeId, setActiveId] = useState<string>(
    defaultTab ?? (tabs && tabs.length > 0 ? tabs[0].id : ""),
  );
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const activeTab = tabs?.find((t) => t.id === activeId) ?? tabs?.[0];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* ── Desktop actions row (hidden on mobile) ─────────────────────── */}
      {actions && (
        <header className="shrink-0 mb-2 hidden md:flex flex-wrap items-center justify-end gap-2">
          {actions}
        </header>
      )}

      {/* ── Desktop tab strip (hidden on mobile) ───────────────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 md:mb-2 hidden md:flex items-center gap-1 overflow-x-auto scrollbar-hide relative">
          <div className="flex items-center gap-0.5 p-0.5 rounded-xl glass border border-black/8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative shrink-0 inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-[10px] uppercase tracking-[0.12em] font-medium",
                    active ? "text-on-brand" : "text-muted hover:text-ink hover:bg-black/5",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-active-bg"
                      className="absolute inset-0 rounded-lg"
                      style={{
                        background: "#4F1E7B",
                        boxShadow:
                          "0 3px 12px -6px rgba(79, 30, 123 ,0.50), 0 0 0 1px rgba(255,255,255,0.18) inset",
                        willChange: "transform, background-color",
                      }}
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {Icon && <Icon className="w-3 h-3" />}
                    {tab.label}
                    {tab.badge != null && tab.badge !== 0 && (
                      <span
                        className={cn(
                          "ml-0.5 px-1.5 py-px rounded-full text-[8px] font-mono leading-none",
                          active ? "bg-white/20 text-on-brand" : "bg-black/8 text-muted",
                        )}
                      >
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

      {/* ── Mobile: flat tab strip row + ⋯ actions button ──────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="md:hidden shrink-0 flex items-center border-b border-black/8 relative">
          {/* Gradient fade-right to hint scrollable overflow */}
          <div
            className="absolute top-0 bottom-0 w-8 bg-gradient-to-l from-paper to-transparent pointer-events-none z-10"
            style={{ right: actions ? "44px" : "0" }}
          />
          {/* Scrollable flat tab list */}
          <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveId(tab.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative shrink-0 inline-flex items-center gap-1.5 px-3 h-11 transition-all text-[10px] uppercase tracking-[0.12em] font-medium whitespace-nowrap",
                    active
                      ? "text-brand border-b-2 border-brand"
                      : "text-muted border-b-2 border-transparent hover:text-ink",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {Icon && <Icon className="w-3 h-3" />}
                    {tab.label}
                    {tab.badge != null && tab.badge !== 0 && (
                      <span
                        className={cn(
                          "ml-0.5 px-1.5 py-px rounded-full text-[8px] font-mono leading-none",
                          active ? "bg-brand/15 text-brand" : "bg-black/8 text-muted",
                        )}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {/* Page-actions overflow button */}
          {actions && (
            <button
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              className="shrink-0 w-11 h-11 flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors border-l border-black/8"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* ── Mobile: no-tabs case — ⋯ button when actions exist ─────────── */}
      {!tabs && actions && (
        <div className="md:hidden shrink-0 flex items-center justify-end border-b border-black/8">
          <button
            onClick={() => setMobileActionsOpen(true)}
            aria-label="Page actions"
            className="w-11 h-11 flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── Body — bounded, never scrolls itself ───────────────────────── */}
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
        ) : (
          children
        )}
      </div>

      {/* ── Mobile actions bottom sheet ─────────────────────────────────── */}
      <AnimatePresence>
        {mobileActionsOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] md:hidden"
              onClick={() => setMobileActionsOpen(false)}
              aria-hidden="true"
            />
            {/* Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[201] glass-strong rounded-t-2xl border-t border-black/8 md:hidden"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
              role="dialog"
              aria-label="Page actions"
              aria-modal="true"
            >
              {/* Grab handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-9 h-1 rounded-full bg-ink/15" aria-hidden="true" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-[10px] uppercase tracking-[0.3em] text-muted">Actions</p>
                <button
                  onClick={() => setMobileActionsOpen(false)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-ink/40 hover:text-ink hover:bg-black/5 transition-colors"
                  aria-label="Close actions"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {/* Actions content — stacks vertically in sheet */}
              <div className="px-4 pb-2 flex flex-col gap-2">{actions}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
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
  title,
  hint,
  actions,
  icon: Icon,
  scroll = false,
  children,
  className,
  bodyClassName,
  flush = false,
  accent = "#4F1E7B",
}: PanelProps) {
  return (
    <section
      className={cn(
        "relative rounded-xl glass border border-black/8 flex flex-col h-full min-h-0 overflow-hidden",
        className,
      )}
      style={{
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.80) inset, 0 0 0 1px rgba(79, 30, 123 ,0.03), 0 8px 32px -10px rgba(0,0,0,0.10), 0 3px 12px -4px rgba(79, 30, 123 ,0.06)",
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
        <header className="relative shrink-0 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            {Icon && (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-black/8"
                style={{
                  background: `linear-gradient(135deg, ${accent}18, ${accent}06)`,
                  color: accent,
                  boxShadow: `0 0 10px ${accent}20`,
                }}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
            )}
            {title && (
              <h3 className="font-display italic text-base text-ink leading-tight">{title}</h3>
            )}
            {hint && (
              <span className="text-[9px] uppercase tracking-[0.14em] text-muted/60 ml-1">
                {hint}
              </span>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}

      {/* Header separator */}
      {(title || actions) && (
        <div
          className="shrink-0 mx-4 h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.04), rgba(0,0,0,0.07) 40%, rgba(0,0,0,0.03))",
          }}
        />
      )}

      <div
        className={cn(
          "flex-1 min-h-0",
          scroll
            ? "overflow-y-auto overscroll-contain scroll-pb-6 panel-scroll"
            : "overflow-hidden",
          !flush && "p-3",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/* Compact stat tile — drop-in for hero metric grids.  */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  accent = "#4F1E7B",
  trend,
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
    <div className="relative rounded-xl glass border border-black/8 p-4 overflow-hidden card-interactive">
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
        <div className="flex items-start justify-between mb-2.5">
          <p className="text-[9px] uppercase tracking-[0.18em] text-muted font-medium leading-none">
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

        <div className="font-display italic text-2xl text-ink leading-none truncate mb-2">
          {value}
        </div>

        <div className="flex items-center gap-2">
          {sub && (
            <p className="text-[9px] uppercase tracking-[0.16em] text-muted truncate flex-1">
              {sub}
            </p>
          )}
          {trend && (
            <span
              className={cn(
                "shrink-0 text-[9px] font-mono font-medium",
                trendPositive ? "text-emerald-600" : "text-rose-500",
              )}
            >
              {trendPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
