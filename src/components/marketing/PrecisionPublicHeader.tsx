import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";

import { MARKETING_VOICE } from "../../lib/product-copy";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../atoms";
import WirelineMark from "../brand/WirelineMark";
import SkipToContentLink from "../layout/SkipToContentLink";

const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

const links = [
  {
    to: "/solutions/support",
    label: "Solutions",
    active: (path: string) => path.startsWith("/solutions/") || path.startsWith("/for/"),
  },
  { to: "/features", label: "Features", active: (path: string) => path === "/features" },
  { to: "/pricing", label: "Pricing", active: (path: string) => path === "/pricing" },
  { to: "/showcase", label: "Demos", active: (path: string) => path === "/showcase" },
  {
    to: "/trust",
    label: "Trust",
    active: (path: string) =>
      path === "/trust" || path === "/security" || path.startsWith("/trust/"),
  },
] as const;

const legalLinks = [
  { to: "/status", label: "Status" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

const mobileControlClassName =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-foreground transition-[background-color,color,transform] hover:bg-secondary hover:text-primary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <header className="fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_98%,transparent)] backdrop-blur-xl">
        <SkipToContentLink href="#main-content" />
        <div className="wl-measure relative mx-auto flex h-16 items-center gap-4 px-5 sm:px-6 lg:px-8">
          <Link
            to="/"
            className="flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Wireline home"
          >
            <WirelineMark className="size-8 shrink-0 text-primary" signal />
            <span>Wireline</span>
          </Link>
          <nav
            className="absolute left-1/2 top-0 hidden h-full -translate-x-1/2 items-center gap-7 lg:flex"
            aria-label="Site"
          >
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full items-center border-b-2 text-sm font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden items-center gap-5 lg:flex">
            <Link
              to="/signin"
              className="text-sm font-medium text-foreground transition-colors hover:text-primary"
            >
              Sign In
            </Link>
            <Link
              to="/signup?plan=personal"
              className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold"
            >
              Start Free
            </Link>
          </div>
          <DialogTrigger asChild>
            <button
              type="button"
              className={`${mobileControlClassName} ml-auto lg:hidden`}
              aria-label={open ? "Close navigation" : "Open navigation"}
              aria-expanded={open}
              aria-controls="wireline-mobile-navigation"
            >
              {open ? <X size={21} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </DialogTrigger>
        </div>
      </header>

      <DialogContent
        id="wireline-mobile-navigation"
        presentation="navigation"
        aria-label="Wireline navigation"
        showClose={false}
        overlayClassName="!top-16 !z-[60] bg-[color:color-mix(in_srgb,var(--wireline-page)_76%,transparent)] backdrop-blur-sm"
      >
        <DialogTitle className="sr-only">Wireline navigation</DialogTitle>
        <DialogDescription className="sr-only">
          Browse Wireline product pages or open your account.
        </DialogDescription>
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
            <p className="wl-overline">Wireline</p>
            <span className="text-right font-[var(--wireline-font-display)] text-sm font-semibold tracking-[-.02em] text-foreground">
              {MARKETING_VOICE.buyingNoun}
            </span>
          </div>
          <nav className="mt-2" aria-label="Mobile site">
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`group flex min-h-14 items-center justify-between border-b border-border text-[1.0625rem] font-semibold tracking-[-.025em] transition-colors ${active ? "text-primary" : "text-foreground hover:text-primary"}`}
                >
                  {link.label}
                  <span
                    aria-hidden="true"
                    className="text-lg transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto grid gap-2 pt-6">
            <Link
              to="/signup?plan=personal"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary min-h-12 text-[length:var(--wireline-typography-body-size)] font-semibold"
            >
              Start Free
            </Link>
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="marketing-btn-secondary min-h-12 text-[length:var(--wireline-typography-body-size)] font-semibold"
            >
              Sign In
            </Link>
            <nav
              aria-label="Legal"
              className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              {legalLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-8 items-center hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                data-compact="true"
                className="inline-flex min-h-8 items-center hover:text-foreground"
                onClick={() => {
                  setOpen(false);
                  window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT));
                }}
              >
                Privacy Choices
              </button>
            </nav>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
