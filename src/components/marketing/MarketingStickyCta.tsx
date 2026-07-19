import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "../../lib/utils";

type Props = {
  href?: string;
  label?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

export default function MarketingStickyCta({
  href = "/signup",
  label = "Build free",
  secondaryHref = "/showcase",
  secondaryLabel = "Hear demo",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-[45] lg:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto border-t border-border bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.05)] sm:px-4">
        <div className="mx-auto flex max-w-lg gap-2">
          <Link
            to={secondaryHref}
            className="marketing-btn-secondary min-h-[48px] min-w-0 flex-1 px-3 text-sm"
          >
            <span>{secondaryLabel}</span>
          </Link>
          <Link
            to={href}
            className="marketing-btn-primary min-h-[48px] min-w-0 flex-[1.25] gap-1.5 px-3 text-sm"
          >
            <span>{label}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
