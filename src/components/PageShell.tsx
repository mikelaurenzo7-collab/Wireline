import React, { ReactNode, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MoreHorizontal, X } from "lucide-react";
import { cn } from "../lib/utils";
import { resolveBrandAccent } from "../lib/brand-token";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { useBodyScrollLock } from "../lib/use-body-scroll-lock";
import { useModalFocusTrap } from "../lib/use-modal-focus-trap";

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
       actions={<ShadButton>…</ShadButton>}
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
  /**
   * Page title. Optional — pages whose title is owned by an upstream
   * ClientToolbar / DesktopContextBar render PageShell headerless (the
   * component already guards every header branch on `showPageHeader`).
   */
  title?: string;
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
  /** Parent ClientRouteViewport scrolls — do not clip body on desktop. */
  scrollable?: boolean;
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
  scrollable = false,
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
  const activeTab = tabs?.find((t) => t.id === activeId) ?? tabs?.[0];

  useBodyScrollLock(mobileActionsOpen);
  useModalFocusTrap(sheetRef, {
    active: mobileActionsOpen,
    onEscape: () => setMobileActionsOpen(false),
  });

  return (
    <div
      data-page-shell-scrollable={scrollable ? "true" : undefined}
      className={cn(
        "w-full flex flex-col",
        scrollable
          ? "h-auto min-h-0 overflow-visible"
          : "h-full min-h-0 overflow-hidden max-md:overflow-visible max-md:h-auto",
        tabs &&
          tabs.length > 0 &&
          "mobile-route-stack max-md:flex max-md:flex-col max-md:gap-2 max-md:min-h-0",
      )}
    >
      {/* ── Page header — every route gets editorial hierarchy ─────────── */}
      {showPageHeader && (
        <header className="shrink-0 mb-1 md:mb-3 flex flex-col items-center text-center gap-0.5 md:gap-1">
          <div className="min-w-0 w-full max-w-2xl">
            {(eyebrow || title) && (
              <div className="lg:hidden">
                {eyebrow && <p className="text-eyebrow text-brand mb-1">{eyebrow}</p>}
                {title && (
                  <h1 className="wl-page-title font-display text-xl sm:text-2xl md:text-[1.65rem] leading-tight tracking-tight text-balance">
                    {title}
                  </h1>
                )}
              </div>
            )}
            {subtitle && (
              <p className="mt-0.5 text-caption max-w-2xl text-pretty lg:hidden">{subtitle}</p>
            )}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center justify-center gap-2 shrink-0 mt-2">
              <div className="hidden md:flex items-center gap-2">{actions}</div>
              {!tabs?.length && (
                <ShadButton
                  type="button"
                  variant="outline"
                  size="icon"
                  disableAnimations
                  onClick={() => setMobileActionsOpen(true)}
                  aria-label="Page actions"
                  className="touch-press hover:scale-[1.05] md:hidden w-9 h-9 text-muted wl-panel"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </ShadButton>
              )}
            </div>
          )}
        </header>
      )}

      {/* Actions-only toolbar when TopBar / DesktopContextBar owns the title */}
      {!showPageHeader && actions && (
        <div className="shrink-0 mb-2 md:mb-3 flex flex-wrap items-center justify-end gap-2">
          <div className="hidden md:flex items-center gap-2">{actions}</div>
          {!tabs?.length && (
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              className="touch-press hover:scale-[1.05] md:hidden w-9 h-9 text-muted wl-panel"
            >
              <MoreHorizontal className="w-5 h-5" />
            </ShadButton>
          )}
        </div>
      )}

      {/* ── Desktop tab strip (hidden on mobile) ───────────────────────── */}
      {tabs && tabs.length > 0 && (
        <div className="shrink-0 md:mb-2 hidden md:flex items-center justify-center gap-1 overflow-x-auto scrollbar-hide relative">
          <div
            role="tablist"
            aria-label="Page sub-navigation"
            className="app-tab-strip flex items-center gap-0.5 p-0.5 wl-panel"
          >
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <ShadButton
                  key={tab.id}
                  type="button"
                  variant="ghost"
                  disableAnimations
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
                    "touch-press hover:scale-[1.02] relative shrink-0 inline-flex min-h-9 sm:min-h-10 h-auto items-center gap-1.5 px-3 py-1.5 transition-all text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.1em] font-medium rounded-none",
                    active ? "app-tab-active" : "text-muted hover:text-foreground hover:bg-black/4",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="tab-active-bg"
                      className="app-tab-active-bg absolute inset-0"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {Icon && <Icon className="w-3 h-3" />}
                    {tab.label}
                    {tab.badge != null && tab.badge !== 0 && (
                      <span
                        className={cn(
                          "ml-0.5 px-1.5 py-px rounded-full wl-micro-badge font-mono leading-none",
                          active ? "app-tab-active-badge" : "bg-black/8 text-muted",
                        )}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </span>
                </ShadButton>
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
            className="tab-toggle-surface flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto tab-strip-scroll max-sm:tab-strip-scroll--fade py-0.5"
          >
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              const active = tab.id === activeId;
              return (
                <ShadButton
                  key={tab.id}
                  type="button"
                  variant="ghost"
                  disableAnimations
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
                    "touch-press hover:scale-[1.02] relative shrink-0 inline-flex min-h-9 h-auto items-center gap-1.5 px-2.5 py-1.5 transition-all wl-label font-medium whitespace-nowrap rounded-none",
                    active ? "app-tab-active" : "text-muted",
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="mobile-tab-active-bg"
                      className="app-tab-active-bg absolute inset-0"
                      transition={{ type: "spring", stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    {Icon && <Icon className="w-3 h-3" />}
                    {tab.label}
                    {tab.badge != null && tab.badge !== 0 && (
                      <span
                        className={cn(
                          "ml-0.5 px-1.5 py-px rounded-full wl-micro-badge font-mono leading-none",
                          active ? "app-tab-active-badge" : "bg-black/8 text-muted",
                        )}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </span>
                </ShadButton>
              );
            })}
          </div>
          {actions && (
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={() => setMobileActionsOpen(true)}
              aria-label="Page actions"
              data-no-min-touch
              className="touch-press hover:scale-[1.05] shrink-0 w-9 h-9 rounded-md text-muted wl-panel"
            >
              <MoreHorizontal className="w-5 h-5" />
            </ShadButton>
          )}
        </div>
      )}

      {/* ── Body — bounded on desktop, scrollable on mobile ──────────── */}
      <div
        className={cn(
          scrollable
            ? "flex-none overflow-visible"
            : "flex-1 min-h-0 overflow-hidden max-md:overflow-y-auto max-md:overscroll-contain max-md:min-h-0",
          bodyClassName,
        )}
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
              className="fixed bottom-0 left-0 right-0 z-[201] wl-panel-elevated border-t border-border md:hidden select-none pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-24px_48px_-20px_rgba(17,17,17,0.18),0_1px_0_rgba(255,255,255,0.75)_inset]"
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
                <div className="w-10 h-1 rounded-full bg-brand/25" aria-hidden="true" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3">
                <p className="text-eyebrow">Actions</p>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => setMobileActionsOpen(false)}
                  className="w-11 h-11 text-foreground/65 hover:text-foreground"
                  aria-label="Close actions"
                >
                  <X className="w-4 h-4" />
                </ShadButton>
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
  /** Size to content instead of filling the viewport (long-form scroll pages). */
  autoHeight?: boolean;
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
  autoHeight = false,
  children,
  className,
  bodyClassName,
  flush = false,
  accent,
}: PanelProps) {
  const resolvedAccent = resolveBrandAccent(accent);
  return (
    <section
      className={cn(
        "relative wl-panel border border-border flex flex-col min-h-0 overflow-hidden",
        autoHeight ? "h-auto" : "h-full",
        "panel-mobile-surface",
        className,
      )}
      data-accent={resolvedAccent}
    >
      {/* Subtle ambient glow behind header */}
      {Icon && (
        <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full pointer-events-none opacity-20 blur-3xl wl-accent-halo" />
      )}

      {(title || actions || hint || Icon) && (
        <header className="relative shrink-0 px-3 py-2.5 max-md:px-4 max-md:py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
            {Icon && (
              <div className="w-8 h-8 flex items-center justify-center shrink-0 border border-border wl-accent-icon-chip">
                <Icon className="w-3.5 h-3.5" />
              </div>
            )}
            {title && (
              <h3 className="font-display text-base text-foreground leading-tight">{title}</h3>
            )}
            {hint && <span className="text-eyebrow ml-1 opacity-80">{hint}</span>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}

      {/* Header separator — edge-to-edge gradient */}
      {(title || actions || hint || Icon) && (
        <div className="shrink-0 h-px wl-panel-divider-fade" />
      )}

      <div
        className={cn(
          autoHeight && !scroll ? "flex-none" : "flex-1 min-h-0",
          scroll
            ? "scroll-viewport overscroll-contain scroll-pb-6 panel-scroll"
            : autoHeight
              ? "overflow-visible"
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
  accent,
  trend,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  accent?: string;
  trend?: { value: number; label?: string };
}) {
  const resolvedAccent = resolveBrandAccent(accent);
  const trendPositive = trend && trend.value >= 0;
  return (
    <div
      className="stat-tile-mobile relative wl-panel border border-border p-4 max-md:p-5 overflow-hidden card-interactive"
      data-accent={resolvedAccent}
    >
      {/* Ambient glow */}
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-25 blur-3xl pointer-events-none wl-accent-halo" />
      {/* Bottom gradient line */}
      <div className="absolute bottom-0 left-0 right-0 h-px opacity-60 wl-accent-bar-fade" />

      <div className="relative">
        <div className="flex items-start justify-between mb-2.5">
          <p className="text-eyebrow leading-none">{label}</p>
          {Icon && (
            <div className="w-7 h-7 flex items-center justify-center border border-border shrink-0 wl-accent-icon-chip">
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <div className="metric-value font-display text-2xl max-md:text-[1.75rem] text-foreground leading-none truncate mb-2">
          {value}
        </div>

        <div className="flex items-center gap-2">
          {sub && <p className="text-caption truncate flex-1 uppercase tracking-wide">{sub}</p>}
          {trend && (
            <span
              className={cn(
                "shrink-0 wl-micro-badge font-mono font-medium",
                trendPositive ? "wl-text-success" : "text-rose-500",
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
