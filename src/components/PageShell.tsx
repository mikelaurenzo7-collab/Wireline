import React, { ReactNode, useState, useRef, useEffect } from "react";
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
     • Actions row is hidden — an ⋯ button opens a bottom sheet.
     • Tab strip uses a segmented control (tab-toggle-surface) for a
       native iOS feel; panels use panel-mobile-surface for one stack.

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
  title,
  subtitle,
  eyebrow,
  actions,
  tabs,
  children,
  defaultTab,
  bodyClassName,
}: PageShellProps) {
  const showPageHeader = Boolean(title || subtitle || eyebrow);
  const [activeId, setActiveId] = useState<string>(
    defaultTab ?? (tabs && tabs.length > 0 ? tabs[0].id : ""),
  );
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  // Tracks start point of a horizontal swipe to switch tabs on touch devices.
  const tabSwipe = useRef<{ x: number; y: number } | null>(null);
  // Ref for focus trap inside the bottom sheet dialog.
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const activeTab = tabs?.find((t) => t.id === activeId) ?? tabs?.[0];

  // M4 — Escape key closes the bottom sheet.
  useEffect(() => {
    if (!mobileActionsOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileActionsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mobileActionsOpen]);

  // C5 — Focus trap: when sheet opens, move focus to close button; on Tab/Shift+Tab
  // cycle within the sheet so keyboard users can't reach content behind it.
  useEffect(() => {
    if (!mobileActionsOpen) return;
    // Move initial focus to the close button.
    closeButtonRef.current?.focus();
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleTab);
    return () => window.removeEventListener("keydown", handleTab);
  }, [mobileActionsOpen]);

  return (
    <div
      className={cn(
        "h-full w-full flex flex-col overflow-hidden",
        tabs &&
          tabs.length > 0 &&
          "mobile-route-stack max-md:flex max-md:flex-col max-md:gap-2 max-md:min-h-0",
      )}
    >
      {/* ── Page header — every route gets editorial hierarchy ─────────── */}
      {showPageHeader && (
        <header className="shrink-0 mb-2 md:mb-3 flex flex-row items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="text-eyebrow text-brand mb-1">{eyebrow}</p>}
            {subtitle && <p className="mt-0.5 text-caption max-w-2xl text-pretty">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <div className="hidden md:flex items-center gap-2">{actions}</div>
              {!tabs?.length && (
                <button
                  onClick={() => setMobileActionsOpen(true)}
                  aria-label="Page actions"
                  className="md:hidden w-11 h-11 flex items-center justify-center text-muted border border-black/8 bg-black/4 active:bg-black/8 transition-colors"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              )}
            </div>
          )}
        </header>
      )}

      {/* ── Desktop tab strip (hidden on mobile) ───────────────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 md:mb-2 hidden md:flex items-center gap-1 overflow-x-auto scrollbar-hide relative">
          <div
            role="tablist"
            aria-label="Page sub-navigation"
            className="flex items-center gap-0.5 p-0.5 glass border border-black/8"
          >
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  id={`pageshell-tab-${tab.id}`}
                  aria-selected={active}
                  aria-controls={`pageshell-panel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") setActiveId(tabs[(i + 1) % tabs.length].id);
                    else if (e.key === "ArrowLeft")
                      setActiveId(tabs[(i - 1 + tabs.length) % tabs.length].id);
                    else if (e.key === "Home") setActiveId(tabs[0].id);
                    else if (e.key === "End") setActiveId(tabs[tabs.length - 1].id);
                  }}
                  className={cn(
                    "relative shrink-0 inline-flex min-h-11 sm:min-h-10 items-center gap-1.5 px-3 py-1.5 transition-all text-[11px] uppercase tracking-[0.1em] font-medium",
                    active ? "text-on-brand" : "text-muted hover:text-ink hover:bg-black/5",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-active-bg"
                      className="absolute inset-0"
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

      {/* ── Mobile: segmented tab strip + ⋯ actions ───────────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="md:hidden shrink-0 flex items-center gap-2 min-h-0">
          <div
            role="tablist"
            className="tab-toggle-surface flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-0.5"
          >
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`pageshell-panel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveId(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") setActiveId(tabs[(i + 1) % tabs.length].id);
                    else if (e.key === "ArrowLeft")
                      setActiveId(tabs[(i - 1 + tabs.length) % tabs.length].id);
                    else if (e.key === "Home") setActiveId(tabs[0].id);
                    else if (e.key === "End") setActiveId(tabs[tabs.length - 1].id);
                  }}
                  className={cn(
                    "native-tap-squish relative shrink-0 inline-flex min-h-11 items-center gap-1.5 px-3 py-2 transition-all text-[11px] uppercase tracking-[0.1em] font-medium whitespace-nowrap",
                    active ? "text-on-brand" : "text-muted",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="mobile-tab-active-bg"
                      className="absolute inset-0"
                      style={{
                        background: "#4F1E7B",
                        boxShadow:
                          "0 3px 12px -6px rgba(79, 30, 123, 0.45), 0 0 0 1px rgba(255,255,255,0.16) inset",
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
          {actions && (
            <button
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              data-no-min-touch
              className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-muted border border-black/8 bg-black/4 active:bg-black/8 transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* ── Body — bounded, never scrolls itself ───────────────────────── */}
      <div
        className={cn("flex-1 min-h-0 overflow-hidden", bodyClassName)}
        onPointerDown={(e) => {
          // N4: don't initiate swipe when the actions sheet is open.
          if (mobileActionsOpen) return;
          if (e.pointerType !== "touch" || !tabs || tabs.length < 2) return;
          tabSwipe.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerUp={(e) => {
          if (!tabSwipe.current || !tabs || tabs.length < 2) return;
          const dx = e.clientX - tabSwipe.current.x;
          const dy = Math.abs(e.clientY - tabSwipe.current.y);
          tabSwipe.current = null;
          // Require ≥60px horizontal, <20px vertical — deliberate swipe only.
          if (Math.abs(dx) < 60 || dy > 20) return;
          const idx = tabs.findIndex((t) => t.id === activeId);
          if (dx < 0 && idx < tabs.length - 1) setActiveId(tabs[idx + 1].id);
          else if (dx > 0 && idx > 0) setActiveId(tabs[idx - 1].id);
        }}
        onPointerCancel={() => {
          tabSwipe.current = null;
        }}
      >
        {tabs && activeTab ? (
          <motion.div
            key={activeTab.id}
            role="tabpanel"
            id={`pageshell-panel-${activeTab.id}`}
            aria-labelledby={`pageshell-tab-${activeTab.id}`}
            initial={{ opacity: 0, transform: "translate3d(0, 4px, 0)" }}
            animate={{ opacity: 1, transform: "translate3d(0, 0, 0)" }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="h-full w-full will-change-[transform,opacity]"
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
              ref={sheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="fixed bottom-0 left-0 right-0 z-[201] glass-elevated border-t border-black/10 md:hidden select-none"
              style={{
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                boxShadow:
                  "0 -24px 48px -20px rgba(30, 0, 48, 0.35), 0 1px 0 rgba(255,255,255,0.75) inset",
              }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.35 }}
              onDragEnd={(_, { offset, velocity }) => {
                if (offset.y > 80 || velocity.y > 400) setMobileActionsOpen(false);
              }}
              role="dialog"
              aria-label="Page actions"
              aria-modal="true"
            >
              {/* Grab handle */}
              <div className="flex justify-center pt-3 pb-2">
                <div
                  className="w-10 h-1 rounded-full"
                  style={{ background: "rgba(79, 30, 123, 0.28)" }}
                  aria-hidden="true"
                />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-eyebrow">Actions</p>
                <button
                  ref={closeButtonRef}
                  onClick={() => setMobileActionsOpen(false)}
                  className="w-11 h-11 rounded-lg flex items-center justify-center text-ink/40 hover:text-ink hover:bg-black/5 transition-colors"
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
        "relative glass border border-black/8 flex flex-col h-full min-h-0 overflow-hidden",
        "panel-mobile-surface",
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

      {(title || actions || hint || Icon) && (
        <header className="relative shrink-0 px-3 py-2.5 max-md:px-4 max-md:py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            {Icon && (
              <div
                className="w-8 h-8 flex items-center justify-center shrink-0 border border-black/8"
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
            {hint && <span className="text-eyebrow ml-1 opacity-80">{hint}</span>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}

      {/* Header separator */}
      {(title || actions || hint || Icon) && (
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
          !flush && "p-3 max-md:p-4",
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
    <div className="stat-tile-mobile relative glass border border-black/8 p-4 max-md:p-5 overflow-hidden card-interactive">
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
          <p className="text-eyebrow leading-none">{label}</p>
          {Icon && (
            <div
              className="w-7 h-7 flex items-center justify-center border border-black/8 shrink-0"
              style={{
                background: `linear-gradient(135deg, ${accent}18, ${accent}06)`,
                color: accent,
              }}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="metric-value font-display italic text-2xl max-md:text-[1.75rem] text-ink leading-none truncate mb-2">
          {value}
        </div>

        <div className="flex items-center gap-2">
          {sub && <p className="text-caption truncate flex-1 uppercase tracking-wide">{sub}</p>}
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
