import { Link, NavLink } from "react-router";

import { BotBoundWordmark } from "../brand/BotBoundBrand";
import SkipToContentLink from "../layout/SkipToContentLink";
import { useChromeHeight } from "../../hooks/useChromeHeight";
import { useAuth } from "../../contexts/AuthContext";

export default function PrecisionPublicHeader() {
  const headerRef = useChromeHeight(".marketing-surface", "--wl-marketing-chrome-top");
  const signedIn = Boolean(useAuth().user);

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
          {signedIn ? (
            // A signed-in visitor goes back to work, not through sign-in again.
            <Link
              to="/studio"
              aria-label="Open Workspace"
              className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold shrink-0 whitespace-nowrap max-[430px]:px-3"
            >
              Open Workspace
            </Link>
          ) : (
            <>
              <Link
                to="/signin"
                className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-md)] px-3 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
        </nav>
      </div>
    </header>
  );
}
