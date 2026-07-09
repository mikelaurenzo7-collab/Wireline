import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import WirelineMark from "../brand/WirelineMark";

const PRODUCT_LINKS = [
  { to: "/for/personal", label: "Personal" },
  { to: "/solutions/sales", label: "Business" },
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
] as const;

const RESOURCE_LINKS = [
  { to: "/showcase", label: "Demos" },
  { to: "/developers", label: "Developers" },
  { to: "/trust", label: "Trust Center" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
  { to: "/status", label: "Status" },
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
        compact ? "px-5 py-6" : "px-5 py-8 sm:px-6 lg:px-8 xl:px-12 2xl:px-16",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="wl-public-rail">
        <div className="marketing-footer-rail">
          <div className="marketing-footer-brand">
            <p className="flex items-center gap-2.5 font-[var(--wireline-font-display)] text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground">
              <WirelineMark className="h-6 w-9 shrink-0 text-primary" signal />
              Wireline
            </p>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Voice, email, text. Yours.
            </p>
          </div>
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
        <div className="marketing-footer-legal mt-7 border-t border-border pt-4 text-sm text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Wireline</span>
        </div>
      </div>
    </footer>
  );
}
