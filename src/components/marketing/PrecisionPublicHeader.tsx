import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const links = [
  { to: "/for/personal", label: "Product" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
] as const;

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-[color:var(--wl-page)]">
      <div className="mx-auto flex h-full max-w-[1680px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-[20px] font-semibold tracking-[-.03em] text-foreground">Wireline</Link>
          <nav className="hidden items-center gap-7 md:flex" aria-label="Site">
            {links.map((link) => <Link key={link.to} to={link.to} className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground">{link.label}</Link>)}
          </nav>
        </div>
        <div className="hidden items-center gap-5 md:flex">
          <Link to="/signin" className="text-[11px] font-semibold uppercase tracking-[.05em] text-foreground">Log in</Link>
          <Link to="/signup?mode=personal" className="marketing-btn-primary min-h-9 px-4 text-[11px] font-semibold uppercase tracking-[.05em]">Start free</Link>
        </div>
        <button type="button" className="grid h-9 w-9 place-items-center border border-border bg-card md:hidden" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>{open ? <X size={18} /> : <Menu size={18} />}</button>
      </div>
      {open ? <div className="border-t border-border bg-card p-4 md:hidden"><nav className="grid gap-1">{links.map((link) => <Link key={link.to} to={link.to} onClick={() => setOpen(false)} className="px-3 py-3 text-[14px] font-medium text-foreground hover:bg-muted">{link.label}</Link>)}<Link to="/signin" onClick={() => setOpen(false)} className="mt-2 px-3 py-3 text-[14px] font-medium text-foreground">Log in</Link><Link to="/signup?mode=personal" onClick={() => setOpen(false)} className="marketing-btn-primary mt-1 py-3 text-[13px]">Start free</Link></nav></div> : null}
    </header>
  );
}
