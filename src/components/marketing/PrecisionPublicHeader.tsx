import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import WirelineMark from "../brand/WirelineMark";

const links = [
  {
    to: "/for/personal",
    label: "Product",
    active: (path: string) => path === "/" || path.startsWith("/for/") || path.startsWith("/solutions/"),
  },
  { to: "/features", label: "Features", active: (path: string) => path === "/features" },
  { to: "/pricing", label: "Pricing", active: (path: string) => path === "/pricing" },
] as const;

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    menuRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-[color:color-mix(in_srgb,var(--wl-page)_96%,transparent)] backdrop-blur-xl">
      <a className="wl-skip-link" href="#main-content">Skip to content</a>
      <div className="wl-measure mx-auto flex h-16 items-center justify-between px-5 sm:px-6 lg:px-8">
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
                  className={`flex h-full items-center border-b-2 text-[13px] font-medium transition-colors ${active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="hidden items-center gap-5 md:flex">
          <Link to="/signin" className="text-[13px] font-medium text-foreground transition-colors hover:text-primary">
            Log in
          </Link>
          <Link to="/signup" className="marketing-btn-primary min-h-9 px-4 text-[12px] font-semibold uppercase tracking-[.05em]">
            Create account
          </Link>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className="wl-control-icon md:hidden"
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
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-border bg-[color:var(--wl-page)] px-5 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:hidden"
        >
          <nav ref={menuRef} className="mx-auto grid max-w-lg gap-2" aria-label="Mobile site">
            {links.map((link) => {
              const active = link.active(location.pathname);
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-12 items-center rounded-[var(--radius-md)] px-4 text-[16px] font-semibold transition-colors ${active ? "bg-[color:var(--wl-accent-container)] text-primary" : "text-foreground hover:bg-muted"}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="my-3 border-t border-border" />
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-[var(--radius-md)] px-4 text-[16px] font-semibold text-foreground hover:bg-muted"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary mt-1 min-h-12 text-[13px] font-semibold uppercase tracking-[.05em]"
            >
              Create account
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
