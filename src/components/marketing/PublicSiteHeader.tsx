import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ArrowRight } from "lucide-react";
import WirelineMark from "../WirelineMark";
import { cn } from "../../lib/utils";

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

  useEffect(() => {
    setMenuOpen(false);
  }, [active, location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
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
            to="/"
            className="flex items-center gap-2.5 group shrink-0"
            data-testid="header-logo"
          >
            <div
              className="w-8 h-8 flex items-center justify-center shrink-0"
              style={{ background: "#4F1E7B" }}
            >
              <WirelineMark className="w-4 h-4 text-white" strokeWidth={130} />
            </div>
            <span className="font-display italic text-xl text-ink leading-none hidden sm:block">
              Wireline
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Site">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="px-3 py-2 text-[13px] font-medium text-ink/65 hover:text-ink transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right actions — context-aware CTA. Hide primary CTA on auth pages
              to avoid redundancy with the inline auth card. */}
          <div className="flex items-center gap-3 shrink-0">
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
                className="hidden sm:inline-flex items-center gap-2 bg-brand text-white text-[13px] font-medium px-5 py-2 hover:bg-[#3d1660] transition-colors duration-300"
              >
                Start trial
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              type="button"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 text-ink"
              aria-expanded={menuOpen}
              aria-controls="public-mobile-nav"
              onClick={() => setMenuOpen((v) => !v)}
              data-testid="mobile-menu-toggle"
            >
              <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {menuOpen && (
        <div
          id="public-mobile-nav"
          className="md:hidden fixed inset-0 z-50 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Site navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-ink/20 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="relative mt-[4.5rem] mx-4 flex flex-col bg-paper border border-ink/10 shadow-[0_24px_60px_-20px_rgba(26,22,20,0.3)] overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 5.5rem - env(safe-area-inset-bottom, 0px))" }}
          >
            <nav className="flex-1 overflow-y-auto py-2" aria-label="Mobile">
              {MOBILE_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center min-h-[48px] px-5 text-[15px] font-medium text-ink hover:bg-ink/[0.03]"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div
              className="shrink-0 border-t border-ink/[0.08] p-4 flex flex-col gap-2.5"
              style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <Link
                to="/signin"
                className="flex items-center justify-center min-h-[48px] text-[14px] font-medium text-ink border border-ink/15 hover:border-ink/30 transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="flex items-center justify-center gap-2 min-h-[48px] text-[14px] font-medium bg-brand text-white hover:bg-[#3d1660] transition-colors"
                onClick={() => setMenuOpen(false)}
              >
                Start free trial
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
