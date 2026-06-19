import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import WirelineMark from "../WirelineMark";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

export type PublicNavActive = "signin" | "signup" | "home";

const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
  { to: "/compare", label: "Compare" },
  { to: "/about", label: "About" },
] as const;

const MOBILE_LINKS = [
  ...NAV_LINKS,
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
  const isAuth = active === "signin" || active === "signup";
  const signedIn = !!user && !authLoading;
  const homeTo = signedIn ? "/agents" : "/";

  useEffect(() => {
    setMenuOpen(false);
  }, [active, location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2 focus:bg-ink focus:text-paper focus:text-[13px] focus:font-medium focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-brand"
      >
        Skip to content
      </a>
      <header
        data-testid="site-header"
        className={cn(
          "fixed top-0 inset-x-0 z-50 transition-all duration-500",
          scrolled
            ? "bg-card/75 backdrop-blur-md border-b border-ink/[0.06] shadow-sm shadow-brand/10"
            : "bg-transparent",
          className,
        )}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 lg:px-12 h-16">
          <Link
            to={homeTo}
            className="flex items-center gap-2.5 group shrink-0"
            data-testid="header-logo"
          >
            <div className="w-8 h-8 flex items-center justify-center shrink-0 bg-brand">
              <WirelineMark className="w-4 h-4 text-white" strokeWidth={130} />
            </div>
            <span className="font-display italic text-xl text-foreground leading-none hidden sm:block chromatic-hover">
              Wireline
            </span>
          </Link>

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
                      ? "text-foreground after:scale-x-100"
                      : "text-foreground/65 hover:text-foreground after:scale-x-0 hover:after:scale-x-100 after:bg-ink/20",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {signedIn && !isAuth ? (
              <Link
                to="/agents"
                data-testid="header-dashboard"
                className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-[var(--color-gemini-gradient-start)] via-[var(--color-gemini-gradient-mid)] to-[var(--color-gemini-gradient-end)] text-white text-[13px] font-medium px-5 py-2 rounded-full active:scale-95 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(155,92,224,0.4)]"
              >
                Open the Studio
              </Link>
            ) : active === "home" ? (
              <>
                <Link
                  to="/signin"
                  data-testid="header-signin"
                  className="hidden sm:inline-flex text-[13px] font-medium text-foreground/65 hover:text-foreground transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  to="/pricing"
                  data-testid="header-cta"
                  className="hidden sm:inline-flex items-center gap-2 bg-gradient-to-r from-[var(--color-gemini-gradient-start)] via-[var(--color-gemini-gradient-mid)] to-[var(--color-gemini-gradient-end)] text-white text-[13px] font-medium px-5 py-2 rounded-full active:scale-95 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgba(155,92,224,0.4)]"
                >
                  Start at $7
                </Link>
              </>
            ) : null}

            <ShadButton
              type="button"
              disableAnimations
              variant="ghost"
              size="icon"
              className="md:hidden text-foreground after:hidden"
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
              onClick={() => setMenuOpen((value) => !value)}
              data-testid="mobile-menu-toggle"
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </ShadButton>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          id="public-mobile-nav"
          className="md:hidden fixed inset-0 z-50 flex flex-col"
          role="dialog"
          aria-modal="true"
        >
          <ShadButton
            type="button"
            variant="ghost"
            disableAnimations
            className="absolute inset-0 h-auto w-full rounded-none bg-ink/20 backdrop-blur-sm hover:bg-ink/20"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative mt-[4.5rem] mx-4 flex flex-col bg-card border border-ink/10 shadow-[0_24px_60px_-20px_rgba(30,27,46,0.3)] overflow-hidden max-h-[calc(100dvh-5.5rem-env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.08] px-5 py-4">
              <div>
                <p className="wl-label text-brand">Explore Wireline</p>
                <h2 className="text-sm font-medium text-foreground">Site navigation</h2>
              </div>
              <ShadButton
                type="button"
                disableAnimations
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="h-10 w-10 text-foreground after:hidden"
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
                        ? "text-foreground border-brand bg-brand/[0.06]"
                        : "text-foreground/80 border-transparent hover:bg-ink/[0.03]",
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
                  to="/agents"
                  data-testid="header-dashboard-mobile"
                  className="flex items-center justify-center gap-2 min-h-[48px] text-[14px] font-medium bg-brand text-white hover:bg-brand-deep transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Open the Studio
                  <ArrowRight aria-hidden="true" className="w-4 h-4" />
                </Link>
              ) : active === "home" ? (
                <>
                  <Link
                    to="/signin"
                    className="flex items-center justify-center min-h-[48px] text-[14px] font-medium text-foreground border border-ink/15 hover:border-ink/30 transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/pricing"
                    className="flex items-center justify-center gap-2 min-h-[48px] text-[14px] font-medium bg-brand text-white hover:bg-brand-deep transition-colors"
                    onClick={() => setMenuOpen(false)}
                  >
                    Start at $7
                    <ArrowRight aria-hidden="true" className="w-4 h-4" />
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
