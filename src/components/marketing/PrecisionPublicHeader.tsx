import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import WirelineMark from "../brand/WirelineMark";

const links = [
  { to: "/for/personal", label: "Product", match: ["/", "/for/personal", "/for/business"] },
  { to: "/features", label: "Features", match: ["/features"] },
  { to: "/pricing", label: "Pricing", match: ["/pricing"] },
] as const;

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = (match: readonly string[]) => match.includes(location.pathname);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-[color:var(--wl-page)]">
      <div className="wl-measure mx-auto flex h-16 items-center justify-between px-5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-8">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5 text-[20px] font-semibold tracking-[-.03em] text-foreground"
            aria-label="Wireline home"
          >
            <WirelineMark className="h-6 w-6 shrink-0 text-primary" />
            <span>Wireline</span>
          </Link>

          <nav className="hidden h-full items-center gap-7 md:flex" aria-label="Site">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex h-full items-center border-b-2 text-[12px] font-medium uppercase tracking-[.05em] transition-colors ${
                  isActive(link.match)
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            to="/signin"
            className="text-[11px] font-semibold uppercase tracking-[.05em] text-foreground"
          >
            Log in
          </Link>
          <Link
            to="/pricing"
            className="marketing-btn-primary min-h-9 px-4 text-[11px] font-semibold uppercase tracking-[.05em]"
          >
            See plans
          </Link>
        </div>

        <button
          type="button"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-foreground md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="wireline-mobile-menu"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {open ? (
        <div
          id="wireline-mobile-menu"
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-border bg-[color:var(--wl-page)] px-5 py-6 md:hidden"
        >
          <nav className="mx-auto grid max-w-lg gap-2" aria-label="Mobile site">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={`flex min-h-12 items-center rounded-md px-4 text-[16px] font-semibold transition-colors ${
                  isActive(link.match)
                    ? "bg-[color:var(--wl-accent-container)] text-primary"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="my-3 border-t border-border" />
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-md px-4 text-[16px] font-semibold text-foreground hover:bg-muted"
            >
              Log in
            </Link>
            <Link
              to="/pricing"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary mt-1 min-h-12 text-[14px] font-semibold uppercase tracking-[.05em]"
            >
              See plans
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
