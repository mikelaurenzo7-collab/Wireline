import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

const TRUST = ["TLS 1.3", "SOC 2 path", "HIPAA-ready", "Stripe billing"] as const;

const LINKS = [
  { to: "/pricing", label: "Pricing" },
  { to: "/compare", label: "Compare" },
  { to: "/showcase", label: "Demos" },
  { to: "/about", label: "About" },
  { to: "/status", label: "Status" },
  { to: "/security", label: "Security" },
  { to: "/support", label: "Support" },
] as const;

type Props = {
  compact?: boolean;
  /** Reserve space above the fixed mobile sticky CTA bar */
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
        "relative z-10 shrink-0 border-t border-black/6 bg-paper/80 backdrop-blur-sm",
        compact ? "px-4 py-3" : "px-5 py-4 lg:px-8",
        aboveStickyCta && "marketing-footer-above-sticky",
        className,
      )}
    >
      <div className="max-w-[1200px] mx-auto space-y-3">
        <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start">
          {TRUST.map((label) => (
            <span
              key={label}
              className="text-[10px] font-bold px-3 py-1 rounded-sm border border-black/10 bg-white/70 text-ink/80 shadow-sm uppercase tracking-widest"
            >
              {label}
            </span>
          ))}
        </div>
        <nav
          className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold uppercase tracking-widest justify-center sm:justify-start"
          aria-label="Footer"
        >
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="min-h-[44px] inline-flex items-center hover:text-black/60 transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link to="/privacy" className="min-h-[44px] inline-flex items-center hover:text-black/60 transition-colors">
            Privacy
          </Link>
          <Link to="/terms" className="min-h-[44px] inline-flex items-center hover:text-black/60 transition-colors">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
