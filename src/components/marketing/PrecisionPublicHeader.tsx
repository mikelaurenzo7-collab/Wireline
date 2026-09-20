import { Menu } from "lucide-react";
import { Link, NavLink } from "react-router";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../atoms";
import { BotBoundLockup } from "../brand/BotBoundBrand";
import SkipToContentLink from "../layout/SkipToContentLink";
import { signupHrefForPlan } from "../../lib/signup-intent";

export default function PrecisionPublicHeader() {
  return (
    <header className="wl-public-header fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_96%,transparent)] backdrop-blur-xl">
      <SkipToContentLink href="#main-content" />
      <div className="wl-measure mx-auto flex h-16 min-w-0 items-center gap-2 px-3 sm:gap-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="min-w-0 shrink rounded-[var(--radius-md)] text-foreground focus-visible:outline-none"
          aria-label="BotBound home"
        >
          <BotBoundLockup size="standard" />
        </Link>

        <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Explore BotBound">
          {[
            { to: "/features", label: "Features" },
            { to: "/pricing", label: "Pricing" },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors wl-focus-ring-halo ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <nav
          className="ml-auto flex min-w-0 shrink-0 items-center gap-1 md:ml-0 md:gap-3"
          aria-label="Account"
        >
          <Link
            to="/signin"
            className="hidden min-h-11 shrink-0 items-center whitespace-nowrap rounded-[var(--radius-md)] px-3 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:inline-flex"
          >
            Sign In
          </Link>
          <Link
            to={signupHrefForPlan("personal")}
            aria-label="Start Free"
            className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold shrink-0 whitespace-nowrap max-[430px]:px-3"
          >
            <span>
              Start<span className="max-[430px]:hidden"> Free</span>
            </span>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 md:hidden"
                aria-label="Open navigation"
              >
                <Menu size={20} aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[100] min-w-44">
              <DropdownMenuItem asChild className="min-h-11 px-3">
                <NavLink to="/features">Features</NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11 px-3">
                <NavLink to="/pricing">Pricing</NavLink>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11 px-3">
                <Link to="/signin">Sign In</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
