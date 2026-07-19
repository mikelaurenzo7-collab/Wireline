import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import WirelineMark from "../brand/WirelineMark";

const OPEN_PRIVACY_CHOICES_EVENT = "wireline:open-privacy-choices";

const PRODUCT_LINKS = [
  { to: "/for/personal", label: "Personal" },
  { to: "/solutions/sales", label: "Business" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Compare" },
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

const LEGAL_LINKS = [
  { to: "/status", label: "Status" },
  { to: "/security", label: "Security" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
] as const;

type Props = {
  compact?: boolean;
  aboveStickyCta?: boolean;
  className?: string;
};

export default function MarketingFooter({
  compact = false,
  aboveStickyCta = false,
  className,
}: Props) {
  return (
    <footer
      className={cn(
        "relative z-10 shrink-0 border-t border-border bg-background",
        compact ? "px-5 py-6" : "px-5 py-9 sm:px-6 sm:py-11 lg:px-8 xl:px-12 2xl:px-16",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="wl-public-rail">
        <div className="marketing-footer-rail">
          <div className="marketing-footer-brand">
            <Link
              to="/"
              aria-label="Wireline home"
              className="inline-flex items-center gap-2.5 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <WirelineMark className="h-6 w-9 shrink-0 text-primary" signal />
              <span>Wireline</span>
            </Link>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Voice, SMS, and email. One trained employee.
            </p>
          </div>

          <div className="marketing-footer-navs grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-12">
            <nav
              aria-label="Product"
              className="marketing-footer-nav flex flex-col items-start gap-1"
            >
              <p className="wl-overline mb-1">Product</p>
              {PRODUCT_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Company"
              className="marketing-footer-nav flex flex-col items-start gap-1"
            >
              <p className="wl-overline mb-1">Company</p>
              {COMPANY_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <nav
              aria-label="Resources"
              className="marketing-footer-nav flex flex-col items-start gap-1"
            >
              <p className="wl-overline mb-1">Resources</p>
              {RESOURCE_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="inline-flex min-h-8 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <div className="marketing-footer-legal mt-8 flex flex-col gap-3 border-t border-border pt-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>&copy; {new Date().getFullYear()} Wireline</span>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="transition-colors hover:text-foreground">
                {link.label}
              </Link>
            ))}
            <button
              type="button"
              className="transition-colors hover:text-foreground"
              onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))}
            >
              Privacy choices
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}
