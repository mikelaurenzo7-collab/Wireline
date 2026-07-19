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
  label = "Build your AI Voice Employee",
  secondaryHref = "/showcase",
  secondaryLabel = "Hear a demo",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-[45] lg:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.05)]">
        <div className="mx-auto flex max-w-lg gap-2">
          <Link to={secondaryHref} className="marketing-btn-secondary min-h-[48px] flex-1 text-sm">
            {secondaryLabel}
          </Link>
          <Link to={href} className="marketing-btn-primary min-h-[48px] flex-[1.35] text-sm">
            {label}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
