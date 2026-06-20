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
  href = "/pricing",
  label = "Start at $9",
  secondaryHref = "/showcase",
  secondaryLabel = "Hear a demo",
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-sticky-cta lg:hidden fixed inset-x-0 bottom-0 z-[45] pointer-events-none",
        className,
      )}
      aria-hidden={false}
    >
      <div className="pointer-events-auto border-t border-ink/[0.08] bg-card/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_-16px_rgba(29,29,31,0.12)] backdrop-blur-md">
        <div className="mx-auto flex max-w-lg gap-2">
          <Link to={secondaryHref} className="marketing-btn-secondary flex-1 min-h-[48px] text-sm">
            {secondaryLabel}
          </Link>
          <Link to={href} className="marketing-btn-primary flex-[1.35] min-h-[48px] text-sm">
            {label}
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}