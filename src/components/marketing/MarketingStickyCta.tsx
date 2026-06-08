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

/**
 * Mobile-first conversion rail — fixed above the home indicator on phones.
 * Hidden on lg+ where hero CTAs stay in the layout.
 */
export default function MarketingStickyCta({
  href = "/signup",
  label = "Start free trial",
  secondaryHref = "/showcase",
  secondaryLabel = "Call a demo",
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
      <div className="pointer-events-auto border-t border-black/8 bg-paper/92 backdrop-blur-xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-12px_40px_-16px_rgba(30,0,48,0.18)]">
        <div className="max-w-lg mx-auto flex gap-2">
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
