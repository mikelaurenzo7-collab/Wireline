import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { X, Keyboard, LogOut, ChevronRight, Waves } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import SystemStatusBadge from "../SystemStatusBadge";
import { NAV_GROUPS, type NavItem } from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";

const RAIL_PINNED_KEY = "wireline.rail.pinned";

/** When unset, prefer icon-only rail on laptops so content gets horizontal room. */
function readInitialPinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(RAIL_PINNED_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return window.matchMedia("(min-width: 1280px)").matches;
  } catch {
    return false;
  }
}

export default function FloatingRail({ 
  open, 
  setOpen, 
  onShowShortcuts 
}: { 
  open: boolean; 
  setOpen: (open: boolean) => void; 
  onShowShortcuts: () => void 
}) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(m => location.pathname === m || location.pathname.startsWith(`${m}/`));
  };

  const [pinned, setPinned] = useState<boolean>(readInitialPinned);

  const togglePin = () => {
    setPinned(p => {
      const next = !p;
      try { window.localStorage.setItem(RAIL_PINNED_KEY, next ? "1" : "0"); } catch { /* localStorage disabled (private mode) — pin state stays in-memory */ }
      return next;
    });
  };

  const expanded = pinned;

  const [navBadges, setNavBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    const fetchCounts = async () => {
      try {
        const r = await authFetch("/api/nav-counts");
        if (!cancelled && r.ok) {
          const d = await r.json();
          setNavBadges(d as Record<string, number>);
        }
      } catch {
        // non-critical badge fetch failure
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const renderRailItem = (item: NavItem) => {
    const active = isActive(item);
    const badge = (navBadges[item.path] ?? 0)
      + (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0);
    return (
      <Link
        key={item.label}
        to={item.path}
        onClick={() => setOpen(false)}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        className={cn(
          "group relative flex items-center rounded-xl transition-colors h-11",
          expanded ? "px-2.5 gap-3" : "justify-center",
          "max-lg:px-2.5 max-lg:gap-3 max-lg:justify-start",
          active ? "text-paper" : "text-ink/65 hover:text-ink"
        )}
        aria-label={`Go to ${item.label}`}
        aria-current={active ? "page" : undefined}
      >
        {active && (
          <motion.div
            layoutId="rail-active"
            className="absolute inset-0 rounded-xl nav-active-bg"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <div className={cn(
          "relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all",
          active ? "bg-white/20" : "group-hover:bg-white/8"
        )}>
          <item.icon
            className={cn("w-4 h-4", active ? "text-paper" : "text-ink/60 group-hover:text-ink")}
            strokeWidth={active ? 2.5 : 1.75}
          />
        </div>

        <span className={cn(
          "relative z-10 leading-none tracking-wide truncate min-w-0",
          expanded ? "flex-1 text-[11px] xl:text-[12px] max-lg:flex-1" : "hidden max-lg:inline-block max-lg:flex-1 max-lg:text-[12px]",
          active ? "font-semibold" : "font-normal"
        )}>
          {item.label}
        </span>

        {!expanded && (
          <span
            aria-hidden="true"
            className="hidden lg:flex pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 items-center h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0 transition-all duration-150 z-50"
          >
            {item.label}
            {badge > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-mono leading-none">
                {badge}
              </span>
            )}
          </span>
        )}

        {badge > 0 && (
          <span
            aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
            className={cn(
              "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center",
              !expanded && "absolute top-1.5 right-1.5 max-lg:relative max-lg:top-auto max-lg:right-auto min-w-[10px] h-[10px] p-0",
              active ? "bg-white/25 text-paper" : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
            )}>
            {expanded ? badge : <span className="max-lg:inline hidden">{badge}</span>}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[60] lg:hidden"
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>

      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {Object.entries(navBadges)
          .filter(([, n]) => n > 0)
          .map(([path, n]) => `${n} item${n === 1 ? "" : "s"} need attention in ${path.slice(1) || "dashboard"}`)
          .join("; ")}
      </div>

      <aside
        aria-label="Main navigation"
        className={cn(
          "fixed top-3 bottom-3 left-3 z-[70] flex flex-col transition-[width,transform] duration-300 ease-out",
          "w-[min(17.5rem,calc(100vw-1.5rem))]",
          expanded
            ? "lg:max-xl:w-[11.75rem] xl:max-2xl:w-[13rem] 2xl:w-[14rem]"
            : "lg:w-[4.5rem]",
          open ? "translate-x-0" : "-translate-x-[calc(100%+0.75rem)] lg:translate-x-0"
        )}
        style={{
          paddingTop: "max(0px, env(safe-area-inset-top, 0))",
          paddingBottom: "max(0px, env(safe-area-inset-bottom, 0))",
        }}
      >
        <div
          className="absolute inset-0 rounded-3xl glass-strong border border-black/8"
          style={{
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.80) inset, " +
              "0 0 0 1px rgba(10,200,212,0.04), " +
              "0 24px 60px -28px rgba(0,0,0,0.30), " +
              "0 8px 24px -8px rgba(10,200,212,0.10)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute top-6 bottom-6 right-0 w-px rounded-full pointer-events-none opacity-60"
          style={{ background: "linear-gradient(to bottom, transparent, rgba(10,200,212,0.45) 30%, rgba(155,89,245,0.38) 70%, transparent)" }}
        />

        <div className="relative z-10 flex flex-col h-full p-2.5 overflow-hidden">
          <div className={cn(
            "flex items-center gap-2.5 mb-3",
            expanded ? "px-1.5" : "justify-center",
            "max-lg:justify-start max-lg:px-1.5"
          )}>
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="relative flex items-center gap-2.5 group min-w-0"
              aria-label="Wireline home"
            >
              <motion.div
                whileHover={{ rotate: 8, scale: 1.06 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="relative w-10 h-10 rounded-2xl flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
                  boxShadow: "0 6px 20px -8px rgba(10,200,212,0.65), 0 0 0 1px rgba(255,255,255,0.22) inset",
                }}
              >
                <Waves className="w-5 h-5 text-paper relative z-10" strokeWidth={2.5} />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
              </motion.div>
              <div className={cn(
                "min-w-0 leading-none",
                expanded ? "flex flex-col gap-1" : "hidden",
                "max-lg:flex max-lg:flex-col max-lg:gap-1"
              )}>
                <span className="brand-wordmark text-[15px] xl:text-[17px] leading-none truncate">
                  {branding.brand_name.toUpperCase()}
                </span>
                <span className="text-[8px] tracking-[0.38em] uppercase text-muted/70 leading-none">
                  Growth Engine
                </span>
              </div>
            </Link>

            <button
              onClick={() => setOpen(false)}
              className="lg:hidden ml-auto w-9 h-9 rounded-lg flex items-center justify-center text-ink/60 hover:text-ink hover:bg-white/5 transition-colors"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 min-h-0 overflow-y-auto panel-scroll -mx-0.5 px-0.5 py-1 space-y-2.5">
            {NAV_GROUPS.map((group, gIdx) => (
              <div key={group.label}>
                <div className={cn(
                  expanded ? "block max-lg:block" : "hidden max-lg:block",
                  "px-3 mb-1 flex items-center gap-2"
                )}>
                  {gIdx === 0 ? null : <span className="h-px flex-1 bg-black/8" />}
                  <span className="text-[7.5px] font-semibold uppercase tracking-[0.48em] text-muted/55 whitespace-nowrap">
                    {group.label}
                  </span>
                  <span className="h-px flex-1 bg-black/8" />
                </div>
                {gIdx > 0 && !expanded && (
                  <div className={cn(
                    "max-lg:hidden mx-3 my-2 h-px opacity-50",
                    "bg-gradient-to-r from-transparent via-black/12 to-transparent"
                  )} aria-hidden="true" />
                )}
                <div className="space-y-0.5">
                  {group.items.map(renderRailItem)}
                </div>
              </div>
            ))}
          </nav>

          <div className={cn(
            "shrink-0 mt-2 pt-2.5 space-y-1.5 border-t border-black/8",
            expanded ? "" : "flex flex-col items-center max-lg:items-stretch"
          )}>
            {(expanded) && (
              <div className="px-1.5 max-lg:block">
                <SystemStatusBadge />
              </div>
            )}
            <div className={cn("max-lg:hidden", !expanded && "block", expanded && "hidden")}>
              <button
                type="button"
                onClick={togglePin}
                className="group relative w-11 h-11 rounded-xl flex items-center justify-center hover:bg-white/5 transition-colors"
                aria-label="Expand navigation rail"
                title="Expand"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 8px rgba(77,255,196,0.7)" }} />
                <span className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-2 z-50">
                  System healthy
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted">Expand →</span>
                </span>
              </button>
            </div>

            <button
              onClick={onShowShortcuts}
              className={cn(
                "group relative h-11 rounded-xl text-muted/65 hover:text-ink hover:bg-white/5 transition-colors flex items-center",
                expanded ? "px-2.5 gap-3" : "justify-center w-11",
                "max-lg:px-2.5 max-lg:gap-3 max-lg:w-full max-lg:justify-start"
              )}
              aria-label="Show keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4 shrink-0" />
              <span className={cn(
                "text-[10px] uppercase tracking-[0.3em] flex-1 text-left",
                expanded ? "block" : "hidden",
                "max-lg:block"
              )}>
                Shortcuts
              </span>
              <kbd className={cn(
                "text-[8px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70 group-hover:border-brand/25 group-hover:text-brand transition-all",
                expanded ? "block" : "hidden",
                "max-lg:block"
              )}>
                ?
              </kbd>
              {!expanded && (
                <span aria-hidden="true" className="hidden lg:flex pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 items-center h-8 px-3 rounded-lg glass-strong border border-black/8 text-[11px] tracking-wide text-ink whitespace-nowrap shadow-md opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-50">
                  Shortcuts <kbd className="ml-2 text-[9px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70">?</kbd>
                </span>
              )}
            </button>

            <div className={cn(
              "rounded-xl border border-black/8 glass overflow-hidden",
              expanded ? "p-2 max-lg:p-2" : "p-1.5 max-lg:p-2"
            )}>
              <div className={cn(
                "flex items-center gap-2.5",
                expanded ? "" : "flex-col gap-2 max-lg:flex-row max-lg:gap-2.5"
              )}>
                <div className="relative shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
                    aria-hidden="true"
                  >
                    {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                  </div>
                  <span
                    className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 bg-emerald-500"
                    style={{ borderColor: "#F5F0E8" }}
                    aria-hidden="true"
                  />
                </div>
                <div className={cn(
                  "min-w-0 flex-1",
                  expanded ? "block" : "hidden",
                  "max-lg:block"
                )}>
                  <p className="text-[11px] font-medium text-ink truncate leading-none mb-0.5">
                    {user?.email?.split("@")[0]}
                  </p>
                  <p className="text-[8px] tracking-[0.28em] uppercase text-muted truncate">
                    {user?.email?.split("@")[1]}
                  </p>
                </div>
                <button
                  onClick={() => signOut()}
                  title="Sign out"
                  aria-label="Sign out"
                  className={cn(
                    "shrink-0 rounded-lg flex items-center justify-center text-ink/40 hover:text-rose-600 hover:bg-rose-500/8 border border-black/7 hover:border-rose-500/35 transition-colors",
                    expanded ? "w-7 h-7" : "w-7 h-7"
                  )}
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={togglePin}
              className="hidden lg:flex w-full h-7 items-center justify-center rounded-lg text-[8px] uppercase tracking-[0.32em] text-muted/55 hover:text-ink hover:bg-white/5 transition-colors"
              aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
              title={expanded ? "Collapse" : "Expand"}
            >
              <ChevronRight className={cn("w-3 h-3 transition-transform", expanded && "rotate-180")} />
            </button>
          </div>
        </div>
      </aside>

      <div
        aria-hidden="true"
        className={cn(
          "hidden lg:block shrink-0 transition-[width] duration-300 ease-out",
          expanded
            ? "lg:max-xl:w-[13rem] xl:max-2xl:w-[14.5rem] 2xl:w-[15.25rem]"
            : "lg:w-[5.25rem]"
        )}
      />
    </>
  );
}
