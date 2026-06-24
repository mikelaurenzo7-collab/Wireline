import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "../atoms";
import WirelineMark from "../brand/WirelineMark";

const links = [
  {
    to: "/for/personal",
    label: "Product",
    description: "Personal assistants for real conversations.",
    active: (path: string) => path === "/" || path.startsWith("/for/") || path.startsWith("/solutions/"),
  },
  {
    to: "/features",
    label: "Features",
    description: "See how calls, texts, and email work together.",
    active: (path: string) => path === "/features",
  },
  {
    to: "/pricing",
    label: "Pricing",
    description: "Simple plans for personal and business assistants.",
    active: (path: string) => path === "/pricing",
  },
] as const;

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <header className="fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wl-page)_96%,transparent)] backdrop-blur-xl">
        <a className="wl-skip-link" href="#main-content">
          Skip to content
        </a>

        <div className="wl-measure mx-auto flex h-16 items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Link
              to="/"
              className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wl-font-display)] text-[20px] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none"
              aria-label="Wireline home"
            >
              <WirelineMark className="h-6 w-6 shrink-0 text-primary" />
              <span>Wireline</span>
            </Link>

            <nav className="hidden h-full items-center gap-6 md:flex" aria-label="Site">
              {links.map((link) => {
                const active = link.active(location.pathname);
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-full items-center border-b-2 text-[13px] font-medium transition-colors ${
                      active
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="hidden items-center gap-5 md:flex">
            <Link to="/signin" className="text-[13px] font-medium text-foreground transition-colors hover:text-primary">
              Sign in
            </Link>
            <Link to="/signup" className="marketing-btn-primary min-h-9 px-4 text-[12px] font-semibold uppercase tracking-[.05em]">
              Create account
            </Link>
          </div>

          <DialogTrigger asChild>
            <button
              type="button"
              className="wl-control-icon h-11 w-11 md:hidden"
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="wireline-mobile-navigation"
            >
              {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </DialogTrigger>
        </div>
      </header>

      <DialogContent
        id="wireline-mobile-navigation"
        presentation="navigation"
        aria-label="Wireline navigation"
        showClose={false}
        overlayClassName="!top-16 !z-[60] bg-[rgba(11,28,48,0.3)] backdrop-blur-[2px]"
      >
        <DialogTitle className="sr-only">Wireline navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Browse Wireline product pages or open your account.
        </DialogDescription>

        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-eyebrow">Explore Wireline</p>
            <DialogClose asChild>
              <button
                type="button"
                className="wl-control-icon h-11 w-11"
                aria-label="Close navigation"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </DialogClose>
          </div>

          <nav className="grid gap-2" aria-label="Mobile site">
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`group flex min-h-[76px] items-center justify-between gap-4 rounded-[var(--radius-lg)] border px-4 py-4 transition-colors ${
                    active
                      ? "border-primary/30 bg-[var(--wl-accent-container)] text-foreground"
                      : "border-border bg-[var(--wl-surface)] text-foreground hover:border-primary/30 hover:bg-[var(--wl-surface-subtle)]"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-[17px] font-semibold tracking-[-.02em]">{link.label}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{link.description}</span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg text-primary transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto grid gap-3 border-t border-border pt-6">
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="marketing-btn-secondary min-h-12 text-[14px] font-semibold"
            >
              Sign in
            </Link>
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary min-h-12 text-[14px] font-semibold"
            >
              Create your assistant
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
