import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";
import SkipToContentLink from "../layout/SkipToContentLink";

export type PublicNavActive = "signin" | "signup" | "home";

const NAV_LINKS = [
  { to: "/for/personal", label: "Use cases" },
  { to: "/features", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
  { to: "/trust", label: "Trust" },
] as const;

const MOBILE_LINKS = [
  ...NAV_LINKS,
  { to: "/compare", label: "Why Wireline" },
  { to: "/about", label: "About" },
  { to: "/support", label: "Support" },
] as const;

type PublicSiteHeaderProps = {
  className?: string;
  active?: PublicNavActive;
};

export default function PublicSiteHeader({ className, active = "home" }: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const isAuth = active === "signin" || active === "signup";
  const signedIn = Boolean(user) && !authLoading;
  // Logged-in default "home" is /overview (Home surface). Studio is the dedicated
  // tool/create surface, reached via primary nav, command palette, or explicit CTAs.
  const homeTo = signedIn ? "/overview" : "/";

  useEffect(() => setMenuOpen(false), [active, location.pathname]);

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
      <SkipToContentLink href="#main-content" />
      <header data-testid="site-header" className={cn("wl-stitch-nav-header", className)}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-8">
            <Link
              to={homeTo}
              className="text-[var(--wireline-typography-body-size)] font-bold tracking-[-.03em] text-primary"
              data-testid="header-logo"
            >
              Wireline
            </Link>
            <nav
              className={cn("hidden items-center gap-1 md:flex", isAuth && "md:hidden")}
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
                      "rounded px-3 py-2 text-[var(--wireline-typography-body-size)] font-medium transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex flex-none items-center gap-2">
            {signedIn && !isAuth ? (
              <Link
                to="/studio"
                data-testid="header-dashboard"
                className="marketing-btn-primary hidden min-h-9 px-4 text-[var(--wireline-typography-caption-size)] font-semibold md:inline-flex"
              >
                Open Studio
              </Link>
            ) : active === "home" ? (
              <>
                <Link
                  to="/signin"
                  data-testid="header-signin"
                  className="hidden min-h-9 items-center px-3 text-[var(--wireline-typography-body-size)] font-semibold text-muted-foreground transition hover:text-foreground md:inline-flex"
                >
                  Sign in
                </Link>
                <Link
                  to="/pricing"
                  data-testid="header-cta"
                  className="marketing-btn-primary hidden min-h-9 px-4 text-[var(--wireline-typography-caption-size)] font-semibold md:inline-flex"
                >
                  Start free
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            ) : null}
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded border border-border bg-card text-foreground md:hidden"
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
        <div
          id="public-mobile-nav"
          className="fixed inset-0 z-[60] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <button
            className="absolute inset-0 h-full w-full bg-foreground/15"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-x-4 top-[4.5rem] overflow-hidden rounded border border-border bg-card shadow-lg">
            <nav className="p-2" aria-label="Mobile">
              {MOBILE_LINKS.map((link) => {
                const isActive =
                  location.pathname === link.to || location.pathname.startsWith(`${link.to}/`);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center rounded px-4 text-[var(--wireline-typography-body-size)] font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                    onClick={() => setMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            <div className="border-t border-border p-4">
              {signedIn && !isAuth ? (
                <Link
                  to="/studio"
                  className="marketing-btn-primary flex min-h-11 text-[var(--wireline-typography-body-size)] font-semibold"
                  onClick={() => setMenuOpen(false)}
                >
                  Open Studio <ArrowRight className="h-4 w-4" />
                </Link>
              ) : active === "home" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/signin"
                    className="flex min-h-11 items-center justify-center rounded border border-border text-[var(--wireline-typography-body-size)] font-semibold"
                    onClick={() => setMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/pricing"
                    className="marketing-btn-primary flex min-h-11 text-[var(--wireline-typography-body-size)] font-semibold"
                    onClick={() => setMenuOpen(false)}
                  >
                    Start free
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
