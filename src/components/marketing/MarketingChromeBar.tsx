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

/** Always visible in the bar itself — the four a visitor reaches for by name. */
const BAR_LINKS = [
  { to: "/trust", label: "Trust" },
  { to: "/status", label: "Status" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

const COLUMNS = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Who It's For", links: WHO_ITS_FOR_LINKS },
  { heading: "Company", links: COMPANY_LINKS },
  { heading: "Resources", links: RESOURCE_LINKS },
] as const;

/**
 * The pinned marketing chrome bar.
 *
 * It replaces a four-column sitemap footer that ran 300px on desktop and 700px
 * on mobile — on the landing page, the tallest single block on the page, sitting
 * directly below a trust section that already repeated three of its own links.
 * Pinned, it costs 45px and stays reachable from every panel.
 *
 * The sitemap is not deleted, it is collapsed: every link stays in the rendered
 * markup so crawlers and assistive technology still see the full internal link
 * graph. The disclosure is a plain button and a panel rather than
 * `<details>/<summary>`, because Chrome lays a `<summary>` out through the
 * details shadow slot and it shrink-wraps its own text no matter what width it
 * is given — measured at 727px inside a 1440px bar, which threw the row's
 * right-aligned control two thirds of the way across the frame instead of onto
 * the rail's right edge.
 */
export default function MarketingChromeBar({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <footer className={cn("marketing-chrome-bar", className)}>
      {/* Painted above the bar row, so the sitemap opens upward into the page
          instead of pushing the bar past the bottom of a frame that cannot
          scroll. `hidden` keeps the links in the document for crawlers while
          removing them from the tab order when collapsed. */}
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
          <div className="col-span-2 sm:col-span-4">
            <button
              type="button"
              data-compact="true"
              className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
            >
              Privacy Choices
            </button>
          </div>
        </div>
      </div>

      {/*
        One row, on the same rail as the content above it.

        It was two: a branding row (mark + "Wireline" + tagline) stacked on a
        legal row that opened with "© Wireline". The mark and the wordmark are
        both already fixed in the header, so the bar showed a visitor the logo
        twice and the company name three times — and the two rows sat on
        different grids, which is what made the sitemap control read as
        off-centre against the copyright beneath it.
      */}
      <div className="marketing-chrome-bar__row">
        <div className="marketing-chrome-bar__rail wl-public-rail flex flex-nowrap items-center gap-x-4 overflow-hidden">
          <span className="marketing-chrome-bar__copy shrink-0 text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Wireline
          </span>

          <nav
            aria-label="Legal"
            className="flex min-w-0 flex-nowrap items-center gap-x-3 text-xs text-muted-foreground sm:gap-x-4"
          >
            {BAR_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex min-h-8 shrink-0 items-center transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
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
