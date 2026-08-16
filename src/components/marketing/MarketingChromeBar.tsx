import { useId, useState } from "react";
import { ChevronUp } from "lucide-react";
import { Link } from "react-router";

import { cn } from "../../lib/utils";

const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

const PRODUCT_LINKS = [
  { to: "/solutions/sales", label: "Sales" },
  { to: "/solutions/support", label: "Support" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Compare" },
] as const;

const WHO_ITS_FOR_LINKS = [
  { to: "/for/personal", label: "Personal" },
  { to: "/for/home-services", label: "Home Services" },
  { to: "/for/insurance", label: "Insurance" },
  { to: "/for/legal", label: "Legal" },
  { to: "/for/medical", label: "Medical" },
  { to: "/for/real-estate", label: "Real Estate" },
  { to: "/for/restaurants", label: "Restaurants" },
  { to: "/for/sales", label: "Sales Teams" },
] as const;

const COMPANY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/blog", label: "Blog" },
  { to: "/contact", label: "Contact" },
  { to: "/changelog", label: "Changelog" },
] as const;

const RESOURCE_LINKS = [
  { to: "/showcase", label: "Demos" },
  { to: "/developers", label: "Developers" },
  { to: "/trust", label: "Trust Center" },
  { to: "/support", label: "Support" },
] as const;

const BAR_LINKS = [
  { to: "/trust", label: "Trust", mobilePriority: false },
  { to: "/status", label: "Status", mobilePriority: false },
  { to: "/privacy", label: "Privacy", mobilePriority: true },
  { to: "/terms", label: "Terms", mobilePriority: true },
] as const;

const COLUMNS = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Who It's For", links: WHO_ITS_FOR_LINKS },
  { heading: "Company", links: COMPANY_LINKS },
  { heading: "Resources", links: RESOURCE_LINKS },
] as const;

/** Compact, pinned public chrome. The full sitemap stays one disclosure away. */
export default function MarketingChromeBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <footer className={cn("marketing-chrome-bar", className)}>
      <div id={panelId} className="marketing-chrome-bar__panel" hidden={!open}>
        <div className="wl-public-rail grid grid-cols-2 gap-x-8 gap-y-6 px-5 py-6 text-left sm:grid-cols-4 lg:px-8">
          {COLUMNS.map(({ heading, links }) => (
            <nav key={heading} aria-label={heading} className="flex flex-col items-start gap-0.5">
              <p className="wl-overline mb-1.5">{heading}</p>
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className="marketing-chrome-bar__row">
        <div className="wl-public-rail marketing-chrome-bar__rail flex items-center gap-x-5">
          <span className="marketing-chrome-bar__copyright shrink-0 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Wireline
          </span>

          <nav
            aria-label="Legal"
            className="marketing-chrome-bar__legal flex min-w-0 items-center gap-x-4 text-xs text-muted-foreground"
          >
            {BAR_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "inline-flex min-h-8 shrink-0 items-center transition-colors hover:text-foreground",
                  !link.mobilePriority && "marketing-chrome-bar__mobile-optional",
                )}
              >
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              data-compact="true"
              className="marketing-chrome-bar__privacy-choices inline-flex min-h-8 shrink-0 items-center transition-colors hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
            >
              Privacy Choices
            </button>
          </nav>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="marketing-chrome-bar__sitemap ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Sitemap
            <ChevronUp
              className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </footer>
  );
}
