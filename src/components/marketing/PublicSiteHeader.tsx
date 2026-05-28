import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import WirelineMark from "../WirelineMark";
import { cn } from "../../lib/utils";

export type PublicNavActive = "signin" | "signup" | "home";

const MORE_LINKS = [
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
  /** Highlight Sign up vs Sign in on auth routes */
  active?: PublicNavActive;
};

export default function PublicSiteHeader({ className, active = "home" }: PublicSiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [active]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={cn(
          "relative z-20 flex shrink-0 items-center justify-between gap-3 px-5 py-4 lg:px-8",
          className,
        )}
      >
        <Link to="/" className="flex items-center gap-3 group min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-[1.02]"
            style={{
              background: "#4F1E7B",
              boxShadow: "0 6px 20px -8px rgba(79,30,123,0.45)",
            }}
          >
            <WirelineMark className="w-5 h-5 text-on-brand" strokeWidth={130} />
          </div>
          <div className="min-w-0">
            <span className="brand-wordmark text-2xl leading-none !text-brand !filter-none block truncate">
              WIRELINE
            </span>
            <span className="text-eyebrow hidden sm:block mt-0.5">Voice + email agents</span>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2 shrink-0" aria-label="Site">
          <Link
            to="/pricing"
            className="hidden md:inline-flex px-3 py-2 text-caption font-medium text-ink/75 hover:text-ink rounded-lg hover:bg-black/5 transition-colors"
          >
            Pricing
          </Link>
          <Link
            to="/showcase"
            className="hidden sm:inline-flex px-3 py-2 text-caption font-medium text-ink/75 hover:text-ink rounded-lg hover:bg-black/5 transition-colors"
          >
            Demos
          </Link>
          <Link
            to="/signin"
            className={cn(
              "hidden sm:inline-flex px-3 py-2 text-caption font-semibold rounded-lg transition-colors",
              active === "signin"
                ? "text-ink bg-black/6"
                : "text-ink/80 hover:text-ink hover:bg-black/5",
            )}
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className={cn(
              "hidden sm:inline-flex items-center justify-center px-4 py-2.5 rounded-full text-[13px] font-semibold tracking-wide transition-all",
              active === "signup"
                ? "bg-brand-deep text-on-brand"
                : "bg-brand text-on-brand hover:bg-[#6A25A3] shadow-[0_4px_14px_-4px_rgba(79,30,123,0.5)]",
            )}
          >
            Start trial
          </Link>

          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-xl border border-black/10 bg-white/60 text-ink hover:bg-white transition-colors"
            aria-expanded={menuOpen}
            aria-controls="public-mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </nav>
      </header>

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
            className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="relative mt-[4.25rem] mx-3 mb-3 flex flex-col rounded-2xl border border-black/10 bg-paper shadow-[0_24px_60px_-20px_rgba(30,0,48,0.35)] overflow-hidden"
            style={{ maxHeight: "calc(100dvh - 5rem - env(safe-area-inset-bottom, 0px))" }}
          >
            <nav className="flex-1 overflow-y-auto p-2" aria-label="Mobile">
              {MORE_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center min-h-[48px] px-4 rounded-xl text-[15px] font-medium text-ink hover:bg-black/5"
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div
              className="shrink-0 border-t border-black/8 p-3 flex flex-col gap-2"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <Link
                to="/signin"
                className="marketing-btn-secondary w-full min-h-[48px]"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Link>
              <Link
                to="/signup"
                className="marketing-btn-primary w-full min-h-[48px]"
                onClick={() => setMenuOpen(false)}
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
