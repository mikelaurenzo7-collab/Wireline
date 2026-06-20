import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import WirelineMark from "../WirelineMark";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

export type PublicNavActive = "signin" | "signup" | "home";

const NAV_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
  { to: "/compare", label: "Why Wireline" },
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
  const signedIn = Boolean(user) && !authLoading;
  const homeTo = signedIn ? "/agents" : "/";

  useEffect(() => setMenuOpen(false), [active, location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:bg-[#1d1d1f] focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:text-white"
      >
        Skip to content
      </a>
      <header
        data-testid="site-header"
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b border-[#1d1d1f]/10 bg-[#f7f7f5]/96 backdrop-blur-md transition-shadow duration-200",
          scrolled && "shadow-[0_4px_18px_rgba(29,29,31,0.05)]",
          className,
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-5 sm:px-8 lg:px-12">
          <Link to={homeTo} className="flex min-w-0 items-center gap-2.5" data-testid="header-logo">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-[14px] bg-[#1d1d1f]">
              <WirelineMark className="h-5 w-5 text-white" strokeWidth={130} />
            </span>
            <span className="truncate text-[1.55rem] font-semibold leading-none tracking-[-0.055em] text-[#1d1d1f]">
              Wireline
            </span>
          </Link>

          <nav className={cn("hidden items-center gap-1 xl:flex", isAuth && "xl:hidden")} aria-label="Site">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 text-[13px] font-medium transition-colors",
                    isActive ? "bg-[#1d1d1f]/7 text-[#1d1d1f]" : "text-[#5e5e64] hover:bg-[#1d1d1f]/5 hover:text-[#1d1d1f]",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex flex-none items-center gap-2">
            {signedIn && !isAuth ? (
              <Link
                to="/agents"
                data-testid="header-dashboard"
                className="marketing-btn-primary hidden min-h-10 px-4 text-[13px] font-semibold md:inline-flex"
              >
                Open Studio
              </Link>
            ) : active === "home" ? (
              <>
                <Link
                  to="/signin"
                  data-testid="header-signin"
                  className="hidden min-h-10 items-center px-2 text-[13px] font-semibold text-[#4f4f55] transition hover:text-[#1d1d1f] md:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  to="/pricing"
                  data-testid="header-cta"
                  className="marketing-btn-primary hidden min-h-10 px-4 text-[13px] font-semibold md:inline-flex"
                >
                  Start at $9
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : null}

            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full border border-[#1d1d1f]/12 bg-white text-[#1d1d1f] transition hover:bg-[#f2f2ef] xl:hidden"
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((value) => !value)}
              data-testid="mobile-menu-toggle"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div id="public-mobile-nav" className="fixed inset-0 z-[60] xl:hidden" role="dialog" aria-modal="true" aria-label="Site navigation">
          <button className="absolute inset-0 h-full w-full bg-[#1d1d1f]/20" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-4 top-[84px] overflow-hidden rounded-[22px] border border-[#1d1d1f]/12 bg-white shadow-[0_24px_70px_rgba(29,29,31,0.2)]">
            <div className="flex items-center justify-between border-b border-[#1d1d1f]/10 px-5 py-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6e6e73]">Explore Wireline</p>
                <p className="mt-1 text-sm font-semibold text-[#1d1d1f]">What can we handle?</p>
              </div>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#f2f2ef] text-[#1d1d1f]" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="p-2" aria-label="Mobile">
              {MOBILE_LINKS.map((link) => {
                const isActive = location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center rounded-xl px-4 text-[15px] font-semibold transition-colors",
                      isActive ? "bg-[#1d1d1f] text-white" : "text-[#36363a] hover:bg-[#f2f2ef]",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-[#1d1d1f]/10 p-4">
              {signedIn && !isAuth ? (
                <Link to="/agents" className="marketing-btn-primary flex min-h-12 text-[14px] font-semibold" onClick={() => setMenuOpen(false)}>
                  Open Studio <ArrowRight className="h-4 w-4" />
                </Link>
              ) : active === "home" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/signin" className="flex min-h-12 items-center justify-center rounded-full border border-[#1d1d1f]/16 text-[14px] font-semibold text-[#1d1d1f]" onClick={() => setMenuOpen(false)}>Sign in</Link>
                  <Link to="/pricing" className="marketing-btn-primary flex min-h-12 text-[14px] font-semibold" onClick={() => setMenuOpen(false)}>Start at $9 <ArrowRight className="h-4 w-4" /></Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}