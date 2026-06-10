import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import WirelineMark from "../WirelineMark";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { useAuth } from "../../contexts/AuthContext";

export type PublicNavActive = "signin" | "signup" | "home";

const NAV_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
  { to: "/compare", label: "Compare" },
  { to: "/about", label: "About" },
] as const;

const MOBILE_LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
  { to: "/compare", label: "Compare" },
  { to: "/about", label: "About" },
  { to: "/status", label: "Status" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
] as const;

type PublicSiteHeaderProps = {
  className?: string;
  active?: PublicNavActive;
};

export default function PublicSiteHeader({ className, active = "home" }: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const reduceMotion = useReducedMotion();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const isAuth = active === "signin" || active === "signup";
  const signedIn = !!user && !authLoading;
  const homeTo = signedIn ? "/ops" : "/";

  useEffect(() => {
    setMenuOpen(false);
  }, [active, location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !menuPanelRef.current) return;

      const focusableNodes = Array.from(
        menuPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusableNodes.length === 0) return;

      const first = focusableNodes[0];
      const last = focusableNodes[focusableNodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
      if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      {/* a11y: keyboard-first skip link. Visually hidden until focused.
          Anchors to #main-content; MarketingPageFrame's <main> carries that id. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2 focus:bg-ink focus:text-paper focus:text-[13px] focus:font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand"
      >
        Skip to content
      </a>
      <header
        data-testid="site-header"
        className={cn(
          "fixed top-0 inset-x-0 z-50 transition-all duration-300",
          scrolled ? "bg-paper/80 backdrop-blur-xl border-b border-ink/[0.06]" : "bg-transparent",
          className,
        )}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 lg:px-12 h-16">
          {/* Logo */}
          <Link
            to={homeTo}
            className="flex items-center gap-2.5 group shrink-0"
            data-testid="header-logo"
          >
            <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-brand">
              <WirelineMark className="w-4 h-4 text-white" strokeWidth={130} />
            </div>
            <span className="font-display italic text-xl text-ink leading-none hidden sm:block chromatic-hover">
              Wireline
            </span>
          </Link>

          {/* Desktop nav — hidden on auth to keep the funnel focused and avoid
              collision with the split-layout showcase column on wide screens. */}
          <nav
            className={cn("hidden md:flex items-center gap-1 shrink-0", isAuth && "md:hidden")}
            aria-label="Site"
          >
            {NAV_LINKS.map((link) => {
              const isActive =
                location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "relative px-3 py-2 text-[13px] font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-px after:origin-left after:bg-brand after:transition-transform after:duration-300",
                    isActive
                      ? "text-ink after:scale-x-100"
                      : "text-ink/65 hover:text-ink after:scale-x-0 hover:after:scale-x-100 after:bg-ink/20",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right actions — context-aware CTA. Hide primary CTA on auth pages
              to avoid redundancy with the inline auth card. */}
          <div className="flex items-center gap-3 shrink-0">
            {signedIn && !isAuth ? (
              <Link
                to="/ops"
                data-testid="header-dashboard"
                className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-brand to-brand-deep text-white text-[13px] font-medium px-5 py-2 hover:opacity-90 transition-all duration-300 hover:shadow-lg hover:shadow-brand/25 hover:-translate-y-px"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                {active !== "signup" && (
                  <Link
                    to="/signin"
                    data-testid="header-signin"
                    className="hidden sm:inline-flex text-[13px] font-medium text-ink/65 hover:text-ink transition-colors"
                  >
                    Sign in
                  </Link>
                )}
                {active !== "signin" && active !== "signup" && (
                  <Link
                    to="/signup"
                    data-testid="header-cta"
                    className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-brand to-brand-deep text-white text-[13px] font-medium px-5 py-2 hover:opacity-90 transition-all duration-300 hover:shadow-lg hover:shadow-brand/25 hover:-translate-y-px"
                  >
                    Start trial
                  </Link>
                )}
              </>
            )}

            {/* Mobile hamburger */}
            <ShadButton
              type="button"
              disableAnimations
              variant="ghost"
              size="icon"
              className="md:hidden text-ink after:hidden"
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="mobile-menu-toggle"
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </ShadButton>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay */}
      <AnimatePresence>
        {menuOpen && (
          <div
            id="public-mobile-nav"
            className="md:hidden fixed inset-0 z-50 flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-mobile-nav-title"
          >
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0 }}
              transition={reduceMotion ? { duration: 0.01 } : { duration: 0.2 }}
              className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.div
              ref={menuPanelRef}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0.01 } }
                  : { opacity: 0, y: -12 }
              }
              transition={
                reduceMotion ? { duration: 0.01 } : { duration: 0.24, ease: [0.16, 1, 0.3, 1] }
              }
              className="relative mt-[4.5rem] mx-4 flex flex-col bg-paper border border-ink/10 shadow-[0_24px_60px_-20px_rgba(26,22,20,0.3)] overflow-hidden max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom,0px))]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] px-5 py-4">
                <div>
                  <p className="wl-label text-brand">Explore Wireline</p>
                  <h2 id="public-mobile-nav-title" className="text-sm font-medium text-ink">
                    Site navigation
                  </h2>
                </div>
                <ShadButton
                  ref={closeButtonRef}
                  type="button"
                  disableAnimations
                  variant="ghost"
                  size="icon"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="h-10 w-10 text-ink after:hidden"
                >
                  <X aria-hidden="true" className="w-4 h-4" />
                </ShadButton>
              </div>
              <nav className="flex-1 overflow-y-auto py-2" aria-label="Mobile">
                {MOBILE_LINKS.map((link) => {
                  const isActive =
                    location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
                  return (
                    <Link
                      key={link.to}
                      to={link.to}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center min-h-[48px] px-5 text-[15px] font-medium border-l-2 transition-colors touch-press",
                        isActive
                          ? "text-ink border-brand bg-brand/[0.06]"
                          : "text-ink/80 border-transparent hover:bg-ink/[0.03]",
                      )}
                      onClick={() => setMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="shrink-0 border-t border-ink/[0.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-2.5">
                {signedIn && !isAuth ? (
                  <Link
                    to="/ops"
                    data-testid="header-dashboard-mobile"
                    className="flex items-center justify-center gap-2 min-h-[48px] text-[14px] font-medium bg-gradient-to-r from-brand to-brand-deep text-white hover:opacity-90 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Open dashboard
                    <ArrowRight aria-hidden="true" className="w-4 h-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/signin"
                      className="flex items-center justify-center min-h-[48px] text-[14px] font-medium text-ink border border-ink/15 hover:border-ink/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Sign in
                    </Link>
                    <Link
                      to="/signup"
                      className="flex items-center justify-center gap-2 min-h-[48px] text-[14px] font-medium bg-gradient-to-r from-brand to-brand-deep text-white hover:opacity-90 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      Start free trial
                      <ArrowRight aria-hidden="true" className="w-4 h-4" />
                    </Link>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
