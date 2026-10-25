import { useEffect, useId, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "../../lib/utils";
import { WirelineWordmark } from "../brand/WirelineBrand";

const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

const PRODUCT_LINKS = [
  { to: "/features", label: "Product" },
  { to: "/pricing", label: "Pricing" },
] as const;

const COMPANY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/blog", label: "Notes" },
  { to: "/contact", label: "Contact" },
  { to: "/changelog", label: "Changelog" },
] as const;

const RESOURCE_LINKS = [
  { to: "/developers", label: "Developers" },
  { to: "/trust", label: "Trust Center" },
  { to: "/support", label: "Support" },
] as const;

/** Always visible in the bar itself. */
const BAR_LINKS = [
  { to: "/support", label: "Support" },
  { to: "/trust", label: "Trust" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

const COLUMNS = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Company", links: COMPANY_LINKS },
  { heading: "Resources", links: RESOURCE_LINKS },
] as const;

/**
 * Compact pinned marketing footer with a native disclosure button.
 * Links stay in the markup; the hidden panel stays out of the focus order
 * and accessibility tree until expanded. Opening enters the links above the
 * trigger; navigation keeps route focus and Escape returns to the disclosure.
 */
export default function MarketingChromeBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.key]);

  useEffect(() => {
    // The panel precedes the trigger, so Tab would otherwise skip every link.
    if (!open) return;
    const firstLink = panelRef.current?.querySelector<HTMLAnchorElement>("a[href]");
    firstLink?.focus({ preventScroll: true });
    // Respect the footer controls' scroll margins above fixed mobile chrome.
    firstLink?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [open]);

  return (
    <footer
      className={cn("marketing-chrome-bar", className)}
      onKeyDown={(event) => {
        if (event.defaultPrevented || event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <div ref={panelRef} id={panelId} className="marketing-chrome-bar__panel" hidden={!open}>
        <div className="wl-public-rail grid grid-cols-2 gap-x-8 gap-y-6 px-5 py-6 text-left sm:grid-cols-3 lg:px-8">
          {COLUMNS.map(({ heading, links }) => (
            <nav key={heading} aria-label={heading} className="flex flex-col items-start gap-0.5">
              <p className="wl-overline mb-1.5">{heading}</p>
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.altKey ||
                      event.ctrlKey ||
                      event.shiftKey
                    ) {
                      return;
                    }
                    setOpen(false);
                    // Same-location navigation does not rerun the route focus
                    // effect. Keep focus visible when its link becomes hidden.
                    if (link.to === `${location.pathname}${location.search}${location.hash}`) {
                      triggerRef.current?.focus();
                    }
                  }}
                  className="wl-focus-ring-halo inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
          <div className="col-span-2 sm:col-span-3">
            <button
              type="button"
              data-compact="true"
              className="wl-focus-ring-halo inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
            >
              Privacy Choices
            </button>
          </div>
        </div>
      </div>

      <div className="marketing-chrome-bar__row">
        <div className="marketing-chrome-bar__rail wl-public-rail flex flex-nowrap items-center gap-x-4 overflow-hidden">
          <span className="marketing-chrome-bar__copy shrink-0 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} <WirelineWordmark inline />
          </span>

          <nav
            aria-label="Legal"
            className="flex min-w-0 flex-nowrap items-center gap-x-3 text-xs text-muted-foreground sm:gap-x-4"
          >
            {BAR_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="wl-focus-ring-halo inline-flex min-h-8 shrink-0 items-center transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="wl-focus-ring-halo ml-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Explore
            <ChevronUp
              className={cn(
                "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </footer>
  );
}
