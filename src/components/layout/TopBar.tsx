import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Keyboard, LogOut, Settings, CreditCard, ChevronDown } from "lucide-react";
import WirelineMark from "../WirelineMark";
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
  // Avatar-menu open state — replaces the always-visible user pill +
  // logout icon that ate ~190px of TopBar width and pushed itself
  // off-screen on narrower laptop viewports (≤1300px ThinkPads).
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  // Close the menu on outside click + Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

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

  const renderNavItem = (
    item: NavItem,
    opts: { withLabel?: boolean; variant?: "topbar" | "drawer" } = {},
  ) => {
    const active = isActive(item);
    const badge =
      (navBadges[item.path] ?? 0) +
      (item.matches?.reduce((sum, m) => sum + (navBadges[m] ?? 0), 0) ?? 0);
    const withLabel = opts.withLabel ?? true;
    const variant = opts.variant ?? "topbar";
    // Color tokens shift entirely between contexts:
    //   topbar  → dark silky-purple bar; inactive text is cream, active sits
    //             on a cream pill with dark-purple text.
    //   drawer  → cream-paper sheet; inactive text is dark ink, active sits
    //             on a silky-purple pill with cream text. Without this split
    //             the mobile drawer rendered cream-on-cream and the nav was
    //             invisible (only the active item showed through).
    const isDrawer = variant === "drawer";
    const activeBg = isDrawer ? "#4F1E7B" : "#FAF9F5";
    const activeTextColor = isDrawer ? "#FAF9F5" : "#3B154C";
    return (
      <Link
        key={item.label}
        to={item.path}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        // title gives icon-only hover tooltip at <xl viewports where
        // the visible text label is hidden via responsive utility.
        title={isDrawer ? undefined : item.label}
        aria-label={`Go to ${item.label}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2 h-8 px-3.5 rounded-xl transition-all text-[12px] font-medium tracking-wide",
          isDrawer
            ? active
              ? "shadow-md shadow-[#4F1E7B]/20"
              : "text-ink/70 hover:text-ink hover:bg-black/5"
            : active
              ? "shadow-md shadow-[#3B154C]/10"
              : "text-[#FAF9F5]/75 hover:text-[#FAF9F5] hover:bg-white/8 hover:shadow-sm",
        )}
        style={active ? { color: activeTextColor } : undefined}
      >
        {active && (
          <motion.div
            layoutId={isDrawer ? "drawernav-active" : "topnav-active"}
            className="absolute inset-0 rounded-xl"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            style={{
              background: activeBg,
              boxShadow: isDrawer
                ? "0 6px 18px -6px rgba(79,30,123,0.45), 0 0 0 1px rgba(255,255,255,0.18) inset"
                : "0 4px 14px -4px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.2) inset",
              // GPU-promote so the layoutId pill cross-fades smoothly
              // between nav buttons on route change. Without this,
              // some lower-spec laptops show ~50ms of layout-thrash
              // when the layout animation kicks in.
              willChange: "transform, background-color",
            }}
          />
        )}
        <item.icon
          className={cn(
            "relative z-10 w-4 h-4 shrink-0 transition-transform duration-300 group-hover:scale-110",
            isDrawer
              ? active
                ? ""
                : "text-ink/55 group-hover:text-ink"
              : active
                ? ""
                : "text-[#FAF9F5]/60 group-hover:text-[#FAF9F5]",
          )}
          style={active ? { color: activeTextColor } : undefined}
          strokeWidth={active ? 2.5 : 1.75}
        />
        {withLabel && (
          <span
            className={cn(
              // Hide labels at all laptop widths (<2xl = <1536px).
              // ThinkPad 1366, MacBook Air 1440 — all icon-only.
              // 1536px+ desktops get the labels back. Icons keep their
              // hover tooltip via title attribute. Drawer variant always
              // shows the label.
              "relative z-10 whitespace-nowrap transition-all duration-300",
              isDrawer ? "inline" : "hidden 2xl:inline",
              active ? "font-semibold" : "font-normal",
            )}
            style={active ? { color: activeTextColor } : undefined}
          >
            {item.label}
          </span>
        )}
        {badge > 0 && (
          <span
            aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
            className={cn(
              "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center transition-all duration-300 group-hover:scale-105",
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
        className="shrink-0 sticky top-0 z-50 bg-[#3B154C] border-b border-[#FAF9F5]/10 text-on-brand"
        style={{
          boxShadow: "0 8px 24px -16px rgba(79, 30, 123, 0.15)",
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
                background: "#FAF9F5",
                boxShadow:
                  "0 4px 14px -4px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.22) inset",
              }}
            >
              <WirelineMark className="w-4 h-4 text-[#3B154C] relative z-10" strokeWidth={130} />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
            </motion.div>
            <span className="brand-wordmark text-[16px] leading-none hidden sm:inline !text-[#FAF9F5] !filter-none">
              {branding.brand_name.toUpperCase()}
            </span>
          </Link>

          {/* Desktop nav — grouped, with subtle dividers between groups.
              Keep flex-none so nav doesn't grow into the right cluster's space. */}
          <nav className="hidden lg:flex items-center gap-1 ml-3 shrink-0">
            {NAV_GROUPS.map((group, gIdx) => (
              <React.Fragment key={group.label}>
                {gIdx > 0 && <span aria-hidden="true" className="mx-1 h-5 w-px bg-white/12" />}
                {group.items
                  .filter((item) => !item.ownerOnly || user?.is_owner === true)
                  .map((item) => renderNavItem(item))}
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
              className="hidden md:flex items-center gap-1.5 h-7 px-2 rounded-lg text-[#FAF9F5]/65 hover:text-[#FAF9F5] hover:bg-white/10 transition-colors"
              aria-label="Show keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <Keyboard className="w-4 h-4" />
              <kbd className="text-[9px] bg-white/10 border border-white/15 px-1.5 py-0.5 rounded font-mono text-[#FAF9F5]/70">
                ?
              </kbd>
            </button>

            {/* Avatar dropdown — single compact button (~36px) replaces
                the prior 190px-wide user pill that was getting pushed
                off-screen on ≤1300px laptop viewports. Click reveals
                a popover with email + Settings + Billing + Sign out.
                Standard SaaS UX pattern (Linear / Notion / Stripe). */}
            <div ref={userMenuRef} className="hidden md:block relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 transition-colors px-1.5 py-1"
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                title={user?.email || "Account"}
              >
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[#3B154C] font-medium text-[10px]"
                  style={{ background: "#FAF9F5" }}
                  aria-hidden="true"
                >
                  {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                </div>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 text-[#FAF9F5]/60 transition-transform",
                    userMenuOpen && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 top-full mt-2 w-64 rounded-xl glass-strong border border-black/8 shadow-xl overflow-hidden z-50"
                  >
                    {/* Email header */}
                    <div className="px-4 py-3 border-b border-black/8">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-muted mb-1">
                        Signed in as
                      </p>
                      <p className="text-[12px] font-medium text-ink truncate">
                        {user?.email || "—"}
                      </p>
                    </div>
                    {/* Menu items */}
                    <div className="py-1">
                      <Link
                        to="/admin?tab=subscription"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[12px] text-ink/80 hover:bg-black/[0.04] hover:text-ink transition-colors"
                        role="menuitem"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-muted" />
                        Billing &amp; subscription
                      </Link>
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-[12px] text-ink/80 hover:bg-black/[0.04] hover:text-ink transition-colors"
                        role="menuitem"
                      >
                        <Settings className="w-3.5 h-3.5 text-muted" />
                        Settings
                      </Link>
                    </div>
                    {/* Sign out */}
                    <div className="border-t border-black/8 py-1">
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut();
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-[12px] text-rose-600 hover:bg-rose-500/8 transition-colors"
                        role="menuitem"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden w-10 h-10 rounded-lg flex items-center justify-center hover:bg-white/5 active:scale-95 transition-all"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5 text-[#FAF9F5]" />
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
              style={{
                /* Push the drawer content below the iOS notch / Dynamic
                 * Island so the logo + close button don't disappear
                 * under the cutout on iPhone X+. Bottom inset is for
                 * iPhone home-bar clearance. */
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              }}
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
                      background: "#4F1E7B",
                    }}
                  >
                    <WirelineMark className="w-4 h-4 text-[#FAF9F5]" strokeWidth={130} />
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
                      {group.items
                        .filter((item) => !item.ownerOnly || user?.is_owner === true)
                        .map((item) => renderNavItem(item, { variant: "drawer" }))}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="pt-3 mt-3 border-t border-black/8 space-y-2">
                <SystemStatusBadge />
                <div className="flex items-center gap-2 rounded-lg border border-black/8 glass px-2 py-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-sm"
                    style={{ background: "#4F1E7B" }}
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
