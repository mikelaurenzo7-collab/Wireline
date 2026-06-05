import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Menu,
  X,
  LogOut,
  Settings,
  CreditCard,
  ChevronDown,
  Crown,
  PlugZap,
  LifeBuoy,
  Search,
} from "lucide-react";
import WirelineMark from "../WirelineMark";
import ThemeToggle from "../ThemeToggle";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import {
  findNavItemForPath,
  NAV_GROUPS,
  NAV_SHORTCUT_HINTS,
  PAGE_TITLES,
  type NavItem,
} from "../../constants/navigation";
import { useBranding } from "../../contexts/BrandingContext";
import { BRAND } from "../../constants/brand-colors";
import { useTheme } from "../../contexts/ThemeContext";
import { shouldShowTopBarThemeToggle } from "../../lib/wireline-app-chrome";
import { WL_CHROME_CLASSES } from "../../lib/wireline-ops-design";
import { ShadButton } from "../ui/shadcn/ShadButton";

interface Props {
  onShowShortcuts: () => void;
  /** Controlled by AppShell so the left-edge swipe gesture can also open it. */
  drawerOpen: boolean;
  onDrawerChange: (open: boolean) => void;
  /** Badge counts shared from AppShell (single polling source). */
  navBadges: Record<string, number>;
}

export default function TopBar({
  onShowShortcuts: _onShowShortcuts,
  drawerOpen,
  onDrawerChange,
  navBadges,
}: Props) {
  const location = useLocation();
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const { branding } = useBranding();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  // Close avatar dropdown on outside click or Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
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

  // Derive a contextual breadcrumb from the current path. PAGE_TITLES is
  // the single source of truth — every nav destination is keyed there.
  // Falls back gracefully for routes we haven't titled yet.
  const showTopBarTheme = shouldShowTopBarThemeToggle(location.pathname);

  const breadcrumb: { eyebrow?: string; title: string } | null = (() => {
    // Exact match wins.
    if (PAGE_TITLES[location.pathname]) {
      const match = findNavItemForPath(location.pathname);
      if (match?.section) return { eyebrow: match.section, title: PAGE_TITLES[location.pathname]! };
      return { title: PAGE_TITLES[location.pathname]! };
    }
    // Walk back the path one segment at a time for parameterised routes
    // like /contacts/abc-123 → match /contacts.
    const segments = location.pathname.split("/").filter(Boolean);
    while (segments.length > 0) {
      segments.pop();
      const candidate = "/" + segments.join("/");
      if (PAGE_TITLES[candidate]) return { title: PAGE_TITLES[candidate]! };
    }
    return null;
  })();

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
    const isDrawer = variant === "drawer";
    const activeBg = isDrawer
      ? "var(--color-brand)"
      : theme === "light"
        ? "rgba(139, 63, 214, 0.12)"
        : "rgba(255, 255, 255, 0.12)";
    const activeTextColor = isDrawer
      ? "var(--color-paper)"
      : theme === "light"
        ? "var(--color-brand)"
        : "#ffffff";
    return (
      <Link
        key={item.label}
        to={item.path}
        onClick={() => {
          if (isDrawer) onDrawerChange(false);
        }}
        {...(item.dataTour ? { "data-tour": item.dataTour } : {})}
        title={isDrawer ? undefined : item.label}
        aria-label={`Go to ${item.label}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-1.5 px-2.5 lg:px-3 rounded-md transition-all text-[11px] sm:text-[12px] font-medium shrink-0",
          isDrawer ? "min-h-11 w-full" : "h-8",
          isDrawer
            ? active
              ? "shadow-md shadow-brand/20"
              : "text-ink/70 hover:text-ink hover:bg-black/5"
            : active
              ? "shadow-md shadow-brand-deep/10"
              : "text-ink/60 hover:text-ink hover:bg-brand/5 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/8",
        )}
        style={active ? { color: activeTextColor } : undefined}
      >
        {active && (
          <motion.div
            layoutId={isDrawer ? "drawernav-active" : "topnav-active"}
            className="absolute inset-0 rounded-md"
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            style={{
              background: activeBg,
              boxShadow: isDrawer
                ? "0 6px 18px -6px color-mix(in srgb, var(--color-brand) 55%, transparent), 0 0 0 1px rgba(255,255,255,0.18) inset, 0 1px 0 rgba(255,255,255,0.28) inset"
                : "0 4px 14px -4px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.2) inset",
              willChange: "transform, background-color",
            }}
          />
        )}
        <item.icon
          className={cn(
            "relative z-10 w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110",
            isDrawer
              ? active
                ? ""
                : "text-ink/65 group-hover:text-ink"
              : active
                ? ""
                : "chrome-muted group-hover:text-brand dark:group-hover:text-[#EFE9DC]",
          )}
          style={active ? { color: activeTextColor } : undefined}
          strokeWidth={active ? 2.5 : 1.75}
        />
        {withLabel && (
          <span
            className={cn(
              "relative z-10 whitespace-nowrap transition-all duration-300 flex-1 min-w-0 truncate text-left",
              isDrawer ? "inline" : "hidden lg:inline",
              active ? "font-semibold" : "font-normal",
            )}
            style={active ? { color: activeTextColor } : undefined}
          >
            {item.label}
          </span>
        )}
        {isDrawer && NAV_SHORTCUT_HINTS[item.path] && !badge && (
          <kbd className="relative z-10 ml-auto shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border border-black/10 bg-black/[0.03] text-muted leading-none">
            {NAV_SHORTCUT_HINTS[item.path]}
          </kbd>
        )}
        {badge > 0 && (
          <span
            aria-label={`${badge} item${badge === 1 ? "" : "s"} need attention in ${item.label}`}
            className={cn(
              "relative z-10 shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full text-[9px] font-mono leading-none flex items-center justify-center transition-transform duration-200 group-hover:scale-105",
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
        className={cn(
          "shrink-0 sticky top-0 z-50 border-b lg:hidden transition-all duration-300 wl-panel-elevated elev-1",
          theme === "light"
            ? "border-[#8B3FD6]/10 text-ink animate-fade-in"
            : "border-[#8B3FD6]/20 text-white animate-fade-in",
        )}
        style={{
          paddingTop: "max(0px, env(safe-area-inset-top, 0))",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="h-11 flex items-center gap-2 px-3 lg:pl-3 lg:pr-4">
          {/* Logo / Brand — VISIBLE under lg only. On lg+ the Sidebar (Aurora
              rail) carries brand chrome, so we hide this to avoid double-brand
              and reclaim the top-bar real-estate for the breadcrumb. */}
          <Link
            to="/"
            className="flex items-center gap-2.5 shrink-0 group lg:hidden"
            aria-label={`${branding.brand_name} home`}
          >
            <motion.div
              whileHover={{ rotate: 6, scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="relative w-7 h-7 rounded-md flex items-center justify-center overflow-hidden shrink-0 elev-1"
              style={{
                background: "#EFE9DC",
                boxShadow:
                  "0 4px 14px -4px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.22) inset",
              }}
            >
              <WirelineMark className="w-4 h-4 text-brand relative z-10" strokeWidth={130} />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent" />
            </motion.div>
            <span className="brand-wordmark text-[15px] sm:text-[16px] leading-none hidden sm:inline text-brand dark:text-[#c77dff] !filter-none">
              {branding.brand_name.toUpperCase()}
            </span>
          </Link>

          {/* Desktop (lg+): contextual breadcrumb. Replaces the horizontal
              nav strip that used to live here — the Aurora rail now carries
              the nav, freeing this space to tell you WHERE YOU ARE.
              Animated key-on-change so the title swap reads instantly. */}
          <div className="hidden lg:flex items-center gap-3 min-w-0 flex-1">
            <AnimatePresence mode="wait">
              {breadcrumb && (
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  className="flex items-baseline gap-3 min-w-0"
                >
                  {breadcrumb.eyebrow && (
                    <>
                      <span className="chrome-eyebrow whitespace-nowrap">{breadcrumb.eyebrow}</span>
                      <span aria-hidden="true" className="chrome-subtle">
                        ·
                      </span>
                    </>
                  )}
                  <h1 className="font-display italic text-[18px] leading-none truncate text-brand dark:text-[color:var(--wl-paper)] lg:sr-only">
                    {breadcrumb.title}
                  </h1>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tablet (md → lg-1): horizontal nav strip so users with hamburger
              viewports still see groups inline. Hidden on phone (drawer carries
              nav) and on lg+ (Sidebar does). */}
          <nav className="hidden md:flex lg:hidden items-center gap-0.5 ml-3 min-w-0 flex-1 overflow-x-auto scrollbar-hide">
            {NAV_GROUPS.map((group, gIdx) => {
              const visibleItems = group.items.filter(
                (item) => !item.ownerOnly || user?.is_owner === true,
              );
              if (visibleItems.length === 0) return null;
              return (
                <React.Fragment key={group.label}>
                  {gIdx > 0 && (
                    <span
                      aria-hidden="true"
                      className="mx-0.5 h-4 w-px bg-brand/10 dark:bg-white/10 shrink-0"
                    />
                  )}
                  {visibleItems.map((item) => renderNavItem(item))}
                </React.Fragment>
              );
            })}
          </nav>

          <div className="flex-1 md:hidden" />

          {/* Right cluster */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Global search — visible on mobile + desktop */}
            <ShadButton
              type="button"
              variant="chrome"
              size="icon"
              disableAnimations
              onClick={() => {
                window.dispatchEvent(new CustomEvent("wireline:open-command-bar"));
              }}
              className="md:w-auto md:h-7 md:px-2 rounded-md chrome-muted hover:text-[#EFE9DC] hover:bg-white/10"
              aria-label="Open command bar"
              title="Search ( / )"
            >
              <Search className="w-4 h-4" />
              <span className="hidden md:inline ml-1.5 text-[11px] chrome-subtle">/</span>
            </ShadButton>

            {showTopBarTheme && <ThemeToggle />}

            {/* Avatar / account dropdown — visible on ALL viewports now.
                On mobile this replaces the sign-out that was buried in the
                drawer; tap the avatar to access Billing, Settings, Sign out.
                Taller py-2 (mobile) / py-1 (desktop) for iOS 44pt target. */}
            <div ref={userMenuRef} className="relative">
              <ShadButton
                type="button"
                variant="chrome"
                disableAnimations
                onClick={() => setUserMenuOpen((v) => !v)}
                className="touch-press flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20 px-1.5 py-2.5 md:py-1 min-h-[44px] h-auto"
                aria-label="Account menu"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                title={user?.email || "Account"}
              >
                <div
                  className="avatar-ring w-6 h-6 rounded-full flex items-center justify-center font-medium text-[10px] shrink-0"
                  style={{ background: BRAND.cream, color: BRAND.purpleDeep }}
                  aria-hidden="true"
                >
                  {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                </div>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 text-[#EFE9DC]/60 transition-transform",
                    userMenuOpen && "rotate-180",
                  )}
                />
              </ShadButton>
              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.97 }}
                    transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
                    role="menu"
                    aria-label="Account menu"
                    className="absolute right-0 top-full mt-2 min-w-[240px] w-64 md:w-72 max-w-[90vw] rounded-md wl-panel-elevated wl-card-shine shadow-2xl shadow-brand/8 overflow-hidden z-50"
                  >
                    {/* Account header — brand-tinted */}
                    <div className="relative px-4 py-3.5 border-b border-black/8 overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-brand/[0.04] to-transparent pointer-events-none" />
                      <p className="text-[9px] uppercase tracking-[0.2em] text-ink/35 mb-1">
                        Signed in as
                      </p>
                      <p className="text-[12px] font-semibold text-ink truncate relative z-10">
                        {user?.email || "—"}
                      </p>
                    </div>
                    <div className="py-1">
                      <Link
                        to="/admin?tab=subscription"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 md:py-2 text-[12px] font-medium text-ink/70 hover:bg-brand/[0.04] hover:text-ink transition-colors group"
                        role="menuitem"
                      >
                        <CreditCard className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Billing &amp; subscription
                      </Link>
                      <Link
                        to="/admin"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 md:py-2 text-[12px] font-medium text-ink/70 hover:bg-brand/[0.04] hover:text-ink transition-colors group"
                        role="menuitem"
                      >
                        <Settings className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Settings
                      </Link>
                      <Link
                        to="/integrations"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 md:py-2 text-[12px] font-medium text-ink/70 hover:bg-brand/[0.04] hover:text-ink transition-colors group"
                        role="menuitem"
                      >
                        <PlugZap className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Integrations
                      </Link>
                      <Link
                        to="/help"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 md:py-2 text-[12px] font-medium text-ink/70 hover:bg-brand/[0.04] hover:text-ink transition-colors group"
                        role="menuitem"
                      >
                        <LifeBuoy className="w-3.5 h-3.5 text-brand/40 group-hover:text-brand/60 transition-colors" />
                        Help &amp; support
                      </Link>
                      {/* Founder Dashboard — only visible to the platform founder (internal platform meta) */}
                      {user?.is_owner && (
                        <Link
                          to="/founder"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2.5 px-4 py-2.5 md:py-2 text-[12px] font-medium text-ink/70 hover:bg-brand/[0.04] hover:text-ink transition-colors group"
                          role="menuitem"
                        >
                          <Crown className="w-3.5 h-3.5 text-amber-500/60 group-hover:text-amber-500 transition-colors" />
                          Founder Dashboard
                        </Link>
                      )}
                    </div>
                    <div className="border-t border-black/8 py-1">
                      <ShadButton
                        type="button"
                        variant="ghost"
                        disableAnimations
                        onClick={() => {
                          setUserMenuOpen(false);
                          signOut();
                        }}
                        className="w-full justify-start gap-2.5 px-4 py-2.5 md:py-2 h-auto text-[12px] font-medium text-rose-600 hover:bg-rose-500/[0.06] hover:text-rose-600"
                        role="menuitem"
                      >
                        <LogOut className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        Sign out
                      </ShadButton>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Hamburger — phone + tablet (< lg). Opens the slide-in nav
                drawer. On mobile this is now the primary way to reach every
                destination (the bottom tab bar was removed to match how
                top SaaS render on mobile web). On desktop (lg+) the Aurora
                rail carries the nav instead. */}
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={() => onDrawerChange(true)}
              className="flex lg:hidden w-10 h-10 rounded-md hover:bg-brand/5 dark:hover:bg-white/5"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5 text-brand dark:text-[#EFE9DC]" />
            </ShadButton>
          </div>
        </div>
      </header>

      {/* Slide-in nav drawer — tablet + mobile (lg:hidden) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[80] lg:hidden"
              onClick={() => onDrawerChange(false)}
              aria-hidden="true"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              className="fixed top-0 bottom-0 left-0 w-[min(21rem,calc(100vw-0.75rem))] z-[85] wl-panel-elevated elev-2 border-r border-black/8 flex flex-col p-4 lg:hidden"
              style={{
                paddingTop: "max(1rem, env(safe-area-inset-top))",
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                paddingLeft: "max(1rem, env(safe-area-inset-left))",
              }}
              aria-label="Main navigation"
            >
              <div className="flex items-center justify-between mb-4">
                <Link
                  to="/"
                  onClick={() => onDrawerChange(false)}
                  className="flex items-center gap-2.5"
                >
                  <div className="w-9 h-9 rounded-md flex items-center justify-center bg-brand">
                    <WirelineMark className="w-4 h-4 text-[#EFE9DC]" strokeWidth={130} />
                  </div>
                  <span className="brand-wordmark text-[16px] leading-none">
                    {branding.brand_name.toUpperCase()}
                  </span>
                </Link>
                {/* 44pt close button */}
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  onClick={() => onDrawerChange(false)}
                  className="touch-press w-11 h-11 rounded-md text-ink/70 hover:text-ink"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </ShadButton>
              </div>

              <nav className="flex-1 min-h-0 scroll-viewport space-y-1">
                {NAV_GROUPS.map((group) => {
                  const visibleItems = group.items.filter(
                    (item) => !item.ownerOnly || user?.is_owner === true,
                  );
                  if (visibleItems.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <p className={WL_CHROME_CLASSES.drawerSection}>{group.label}</p>
                      <div className="space-y-0.5">
                        {visibleItems.map((item) => renderNavItem(item, { variant: "drawer" }))}
                      </div>
                    </div>
                  );
                })}
                <div
                  className="h-px my-2 mx-2 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent"
                  aria-hidden="true"
                />
                <p className={WL_CHROME_CLASSES.drawerSection}>Account</p>
                <div className="space-y-0.5">
                  {renderNavItem(
                    {
                      label: "Help",
                      path: "/help",
                      icon: LifeBuoy,
                    },
                    { variant: "drawer" },
                  )}
                  {user?.is_owner &&
                    renderNavItem(
                      {
                        label: "Founder",
                        path: "/founder",
                        icon: Crown,
                      },
                      { variant: "drawer" },
                    )}
                  {renderNavItem(
                    {
                      label: "Integrations",
                      path: "/integrations",
                      icon: PlugZap,
                    },
                    { variant: "drawer" },
                  )}
                </div>
              </nav>

              <div className="pt-3 mt-3 aurora-divider space-y-2">
                <div className="flex items-center gap-2 rounded-md wl-panel px-2 py-2">
                  <div className="avatar-ring w-8 h-8 rounded-full flex items-center justify-center text-on-brand font-medium text-sm shrink-0 bg-brand">
                    {user?.email?.slice(0, 1).toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-ink truncate leading-none mb-0.5">
                      {user?.email?.split("@")[0]}
                    </p>
                    <p className="wl-label text-muted truncate">{user?.email?.split("@")[1]}</p>
                  </div>
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="icon"
                    disableAnimations
                    onClick={() => signOut()}
                    aria-label="Sign out"
                    className="touch-press w-11 h-11 rounded-md text-ink/65 hover:text-rose-600 hover:bg-rose-500/8"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </ShadButton>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
