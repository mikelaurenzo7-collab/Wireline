import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

const PRODUCT_LINKS = [
  { to: "/for/personal", label: "For you" },
  { to: "/solutions/sales", label: "For business" },
  { to: "/features", label: "Voice, email & text" },
  { to: "/pricing", label: "Pricing" },
] as const;

const RESOURCE_LINKS = [
  { to: "/showcase", label: "Demos" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
  { to: "/status", label: "Status" },
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
        compact ? "px-5 py-6" : "px-5 py-9 sm:px-6 lg:px-8 xl:px-12 2xl:px-16",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="wl-measure mx-auto">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,1.25fr)_auto_auto] sm:items-start sm:gap-12">
          <div className="max-w-sm">
            <p className="wl-overline">Wireline</p>
            <p className="mt-3 text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
              An assistant for your life or an operating line for your business—voice, email, and
              text working from the brief you define for each agent.
            </p>
          </div>
          <nav aria-label="Product" className="flex flex-col items-start gap-1">
            <p className="wl-overline mb-1">Product</p>
            {PRODUCT_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Resources" className="flex flex-col items-start gap-1">
            <p className="wl-overline mb-1">Resources</p>
            {RESOURCE_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="inline-flex min-h-9 items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>Custom agents. Clear rules. Useful outcomes.</span>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
