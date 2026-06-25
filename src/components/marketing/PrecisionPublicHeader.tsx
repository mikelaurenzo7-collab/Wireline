import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "../atoms";
import WirelineMark from "../brand/WirelineMark";

const links = [
  { to: "/for/personal", label: "Product", active: (path: string) => path === "/" || path.startsWith("/for/") || path.startsWith("/solutions/") },
  { to: "/features", label: "Features", active: (path: string) => path === "/features" },
  { to: "/pricing", label: "Pricing", active: (path: string) => path === "/pricing" },
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
        <a className="wl-skip-link" href="#main-content">Skip to content</a>
        <div className="wl-measure mx-auto flex h-16 items-center justify-between gap-4 px-5 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none" aria-label="Wireline home">
              <WirelineMark className="h-6 w-6 shrink-0 text-primary" />
              <span>Wireline</span>
            </Link>
            <nav className="hidden h-full items-center gap-6 md:flex" aria-label="Site">
              {links.map((link) => {
                const active = link.active(location.pathname);
                return <Link key={link.to} to={link.to} aria-current={active ? "page" : undefined} className={`flex h-full items-center border-b-2 text-[var(--wireline-typography-caption-size)] font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{link.label}</Link>;
              })}
            </nav>
          </div>
          <div className="hidden items-center gap-5 md:flex">
            <Link to="/signin" className="text-[var(--wireline-typography-caption-size)] font-medium text-foreground transition-colors hover:text-primary">Sign in</Link>
            <Link to="/signup" className="marketing-btn-primary min-h-9 px-4 text-[var(--wireline-typography-caption-size)] font-semibold uppercase tracking-[.05em]">Create account</Link>
          </div>
          <DialogTrigger asChild>
            <button type="button" className={`${mobileControlClassName} md:hidden`} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="wireline-mobile-navigation">
              {open ? <X size={21} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </DialogTrigger>
        </div>
      </header>

      <DialogContent id="wireline-mobile-navigation" presentation="navigation" aria-label="Wireline navigation" showClose={false} overlayClassName="!top-16 !z-[60] bg-[rgba(11,28,48,0.2)] backdrop-blur-[1px]">
        <DialogTitle className="sr-only">Wireline navigation</DialogTitle>
        <DialogDescription className="sr-only">Browse Wireline product pages or open your account.</DialogDescription>
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <p className="wl-overline">Explore Wireline</p>
            <span className="font-[var(--wireline-font-display)] text-sm font-semibold tracking-[-.02em] text-foreground">Menu</span>
          </div>
          <nav className="mt-2" aria-label="Mobile site">
            {links.map((link) => {
              const active = link.active(location.pathname);
              return <Link key={link.to} to={link.to} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)} className={`group flex min-h-14 items-center justify-between border-b border-border text-[1.0625rem] font-semibold tracking-[-.025em] transition-colors ${active ? "text-primary" : "text-foreground hover:text-primary"}`}>{link.label}<span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-0.5">→</span></Link>;
            })}
          </nav>
          <div className="mt-auto grid gap-2 pt-6">
            <Link to="/signup" onClick={() => setOpen(false)} className="marketing-btn-primary min-h-12 text-[var(--wireline-typography-body-size)] font-semibold">Create your assistant</Link>
            <Link to="/signin" onClick={() => setOpen(false)} className="marketing-btn-secondary min-h-12 text-[var(--wireline-typography-body-size)] font-semibold">Sign in</Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
