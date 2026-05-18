import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Keyboard, LogOut, Waves } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { authFetch } from "../../lib/api";
import { cn } from "../../lib/utils";
import SystemStatusBadge from "../SystemStatusBadge";
import { NAV_GROUPS, type NavItem } from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";

export default function TopBar({ onShowShortcuts }: { onShowShortcuts: () => void }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (item: NavItem) => {
    if (location.pathname === item.path) return true;
    if (!item.matches) return false;
    return item.matches.some(
      (m) => location.pathname === m || location.pathname.startsWith(`${m}/`),
    );
  };

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
        /* non-critical */
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 120_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const renderNavItem = (item: NavItem, opts: { withLabel?: boolean } = {}) => {
    const active = isActive(item);
    const badge =
      (navBadges[item.path] ?? 0) +
      (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0);
    const withLabel = opts.withLabel ?? true;
    return (
      <Link
        key={item.label}
        to={item.path}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        aria-label={`Go to ${item.label}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2 h-8 px-2 rounded-lg transition-colors text-[12px] font-medium tracking-wide",
          active ? "text-paper" : "text-ink/65 hover:text-ink hover:bg-white/8",
        )}
      >
        {active && (
          <motion.div
            layoutId="topnav-active"
            className="absolute inset-0 rounded-lg nav-active-bg"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
          />
        )}
        <item.icon
          className={cn(
            "relative z-10 w-4 h-4 shrink-0",
            active ? "text-paper" : "text-ink/55 group-hover:text-ink",
          )}
          strokeWidth={active ? 2.5 : 1.75}
        />
        {withLabel && (
          <span
            className={cn(
              "relative z-10 whitespace-nowrap",
              active ? "font-semibold" : "font-normal",
            )}
          >
            {item.label}
          </span>
        )}
        {badge > 0 && (
          <span
            aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
            className={cn(
              "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center",
              active
                ? "bg-white/25 text-paper"
                : "bg-rose-500/20 text-rose-400 border border-rose-500/30",
            )}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      <header
        aria-label="Main navigation"
        className="shrink-0 sticky top-0 z-50 glass-strong border-b border-black/8"
        style={{
          boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 8px 24px -16px rgba(10,200,212,0.10)",
          paddingTop: "max(0px, env(safe-area-inset-top, 0))",
        }}
      >
        <div className="h-11 flex items-center gap-2 px-2 md:px-3 lg:px-4">
          {/* Logo / Brand */}
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 group"
            aria-label={`${branding.brand_name} home`}
          >
            <motion.div
              whileHover={{ rotate: 8, scale: 1.06 }}
              whileTap={{ scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="relative w-7 h-7 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
              style={{
                background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
                boxShadow:
                  "0 4px 14px -4px rgba(10,200,212,0.55), 0 0 0 1px rgba(255,255,255,0.22) inset",
              }}
            >
              <Waves className="w-4 h-4 text-paper relative z-10" strokeWidth={2.5} />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
            </motion.div>
            <span className="brand-wordmark text-[16px] leading-none hidden sm:inline">
              {branding.brand_name.toUpperCase()}
            </span>
          </Link>

          {/* Desktop nav — grouped, with subtle dividers between groups.
              Keep flex-none so nav doesn't grow into the right cluster's space. */}
          <nav className="hidden lg:flex items-center gap-1 ml-3 shrink-0">
            {NAV_GROUPS.map((group, gIdx) => (
              <React.Fragment key={group.label}>
                {gIdx > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-black/12" />}
                {group.items.map((item) => renderNavItem(item))}
              </React.Fragment>
            ))}
          </nav>

          {/* Flex spacer pushes the right cluster to the edge */}
          <div className="flex-1" />

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden md:block">
              <SystemStatusBadge />
            </div>
            <button
              onClick={onShowShortcuts}
              className="hidden md:flex items-center gap-1.5 h-7 px-2 rounded-lg text-muted/65 hover:text-ink hover:bg-white/5 transition-colors"
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
              <kbd className="text-[9px] glass border border-black/10 px-1.5 py-0.5 rounded font-mono text-muted/70">
                ?
              </kbd>
            </button>

            <div className="hidden md:flex items-center gap-2 rounded-lg border border-black/8 glass px-2 py-1">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white font-medium text-[10px]"
                style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
                aria-hidden="true"
              >
                {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 max-w-[140px]">
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
                className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-ink/40 hover:text-rose-600 hover:bg-rose-500/8 border border-black/7 hover:border-rose-500/35 transition-colors"
              >
                <LogOut className="w-3 h-3" />
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5 text-ink" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[80] lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 32 }}
              className="fixed top-0 bottom-0 left-0 w-[280px] z-[85] glass-strong border-r border-black/8 flex flex-col p-4 lg:hidden"
              aria-label="Main navigation"
            >
              <div className="flex items-center justify-between mb-4">
                <Link
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2.5"
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      background: "linear-gradient(135deg, #0AC8D4 0%, #9B59F5 50%, #E040C0 100%)",
                    }}
                  >
                    <Waves className="w-4 h-4 text-paper" strokeWidth={2.5} />
                  </div>
                  <span className="brand-wordmark text-[16px] leading-none">
                    {branding.brand_name.toUpperCase()}
                  </span>
                </Link>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-ink/60 hover:text-ink hover:bg-white/5 transition-colors"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <nav className="flex-1 min-h-0 overflow-y-auto space-y-3">
                {NAV_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-2 mb-1 text-[8px] font-semibold uppercase tracking-[0.42em] text-muted/55">
                      {group.label}
                    </div>
                    <div className="space-y-0.5">
                      {group.items.map((item) => renderNavItem(item))}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="pt-3 mt-3 border-t border-black/8 space-y-2">
                <SystemStatusBadge />
                <div className="flex items-center gap-2 rounded-lg border border-black/8 glass px-2 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ background: "linear-gradient(135deg, #0AC8D4, #9B59F5)" }}
                  >
                    {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink truncate leading-none mb-0.5">
                      {user?.email?.split("@")[0]}
                    </p>
                    <p className="text-[9px] tracking-[0.28em] uppercase text-muted truncate">
                      {user?.email?.split("@")[1]}
                    </p>
                  </div>
                  <button
                    onClick={() => signOut()}
                    aria-label="Sign out"
                    className="w-8 h-8 rounded-md flex items-center justify-center text-ink/40 hover:text-rose-600 hover:bg-rose-500/8 border border-black/7 hover:border-rose-500/35 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
