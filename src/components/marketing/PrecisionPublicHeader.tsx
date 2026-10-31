import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Menu, Moon, Sun, X } from "lucide-react";

import { BotBoundWordmark } from "../brand/BotBoundBrand";
import SkipToContentLink from "../layout/SkipToContentLink";
import { useChromeHeight } from "../../hooks/useChromeHeight";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";

export default function PrecisionPublicHeader() {
  const headerRef = useChromeHeight(".marketing-surface", "--wl-marketing-chrome-top");
  const signedIn = Boolean(useAuth().user);
  const { resolvedTheme, toggleTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile navigation drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // Close on Escape key
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header
      ref={headerRef}
      className="wl-public-header fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_96%,transparent)] backdrop-blur-xl"
    >
      <SkipToContentLink href="#main-content" />
      <div className="wl-public-header__rail mx-auto flex min-h-16 min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:gap-x-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex min-h-11 max-w-full shrink-0 items-center rounded-[var(--radius-md)] px-1 text-foreground wl-focus-ring-halo"
          aria-label="BotBound home"
        >
          <BotBoundWordmark className="wl-public-header__wordmark" />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Explore BotBound">
          <NavLink
            to="/features"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Product
          </NavLink>
          <NavLink
            to="/pricing"
            className="wl-focus-ring-halo inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Pricing
          </NavLink>
        </nav>
        <nav
          className="ml-auto flex min-w-0 shrink-0 items-center gap-1 md:ml-0 md:gap-3"
          aria-label="Account"
        >
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${nextTheme} appearance`}
            title={`Switch to ${nextTheme} appearance`}
            className="wl-focus-ring-halo hidden min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
          >
            {resolvedTheme === "dark" ? (
              <Sun className="size-5" aria-hidden="true" />
            ) : (
              <Moon className="size-5" aria-hidden="true" />
            )}
          </button>
          {signedIn ? (
            // A signed-in visitor goes back to work, not through sign-in again.
            <Link
              to="/studio"
              aria-label="Open Workspace"
              className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold shrink-0 whitespace-nowrap max-[430px]:px-3"
            >
              <span className="max-[389px]:hidden">Open Workspace</span>
              <span className="min-[390px]:hidden">Workspace</span>
            </Link>
          ) : (
            <>
              <Link
                to="/signin"
                className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-md)] px-3 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 max-[389px]:hidden"
              >
                Sign In
              </Link>
              <Link
                to="/signup"
                aria-label="Get Started"
                className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold shrink-0 whitespace-nowrap max-[430px]:px-3"
              >
                Get Started
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden wl-focus-ring-halo"
          >
            {mobileMenuOpen ? (
              <X className="size-5" aria-hidden="true" />
            ) : (
              <Menu className="size-5" aria-hidden="true" />
            )}
          </button>
        </nav>
      </div>

      {mobileMenuOpen && (
        <div
          className="border-t border-border bg-background/95 px-4 py-3 shadow-xl backdrop-blur-2xl md:hidden"
          role="navigation"
          aria-label="Mobile Navigation"
        >
          <div className="flex flex-col space-y-1">
            <NavLink
              to="/features"
              onClick={() => setMobileMenuOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              Product
            </NavLink>
            <NavLink
              to="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="flex min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              Pricing
            </NavLink>
            {!signedIn && (
              <NavLink
                to="/signin"
                onClick={() => setMobileMenuOpen(false)}
                className="hidden min-h-11 items-center rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-muted max-[389px]:flex"
              >
                Sign In
              </NavLink>
            )}
            <button
              type="button"
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              className="wl-focus-ring-halo flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-medium text-foreground transition-colors hover:bg-muted"
              aria-label={`Switch to ${nextTheme} appearance`}
            >
              {resolvedTheme === "dark" ? (
                <Sun className="size-5 text-muted-foreground" aria-hidden="true" />
              ) : (
                <Moon className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
              <span>Use {nextTheme} appearance</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
