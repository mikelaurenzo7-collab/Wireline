import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

const TRUST = ["TLS 1.3", "SOC 2 in progress", "HIPAA controls", "Stripe billing"] as const;

const LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Why Wireline" },
  { to: "/showcase", label: "Demos" },
  { to: "/about", label: "About" },
  { to: "/status", label: "Status" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
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
        "relative z-10 shrink-0 border-t border-[#1d1d1f]/10 bg-[#f7f7f5]",
        compact ? "px-4 py-3" : "px-5 py-4 lg:px-8 xl:px-12 2xl:px-16",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="wl-measure space-y-3 text-center">
        <div className="flex flex-wrap justify-center gap-1.5">
          {TRUST.map((label) => (
            <span
              key={label}
              className="rounded-full border border-[#1d1d1f]/10 bg-white px-2.5 py-1 text-[11px] font-medium text-[#4f4f55]"
            >
              {label}
            </span>
          ))}
        </div>
        <nav
          className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-caption font-medium"
          aria-label="Footer"
        >
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="inline-flex min-h-[44px] items-center text-[#5e5e64] transition hover:text-[#1d1d1f]"
            >
              {link.label}
            </Link>
          ))}
          <Link to="/privacy" className="inline-flex min-h-[44px] items-center text-[#5e5e64] transition hover:text-[#1d1d1f]">
            Privacy
          </Link>
          <Link to="/terms" className="inline-flex min-h-[44px] items-center text-[#5e5e64] transition hover:text-[#1d1d1f]">
            Terms
          </Link>
        </nav>
        <p className="text-[11px] leading-relaxed text-[#6e6e73]">
          Start with the plan that fits your call volume. Change or cancel anytime.
        </p>
      </div>
    </footer>
  );
}
