import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { emitProductEvent } from "../../lib/product-event-client";
import { MARKETING_VOICE } from "../../lib/product-copy";
import { cn } from "../../lib/utils";
import { useChromeHeight } from "../../hooks/useChromeHeight";

type Props = {
  href?: string;
  label?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

export default function MarketingStickyCta({
  href = "/signup",
  label = MARKETING_VOICE.primaryCta,
  secondaryHref = "/features",
  secondaryLabel = "How It Works",
  className,
}: Props) {
  const [visible, setVisible] = useState(false);
  const chromeRef = useChromeHeight<HTMLDivElement>(
    ":root",
    "--wl-marketing-sticky-height",
    visible,
  );

  useEffect(() => {
    const heroAction = document.querySelector(".marketing-hero__actions");
    const hero = document.querySelector(".marketing-hero");
    const revealBoundary = heroAction ?? hero;

    if (!revealBoundary || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(revealBoundary);
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={chromeRef}
      className={cn(
        "marketing-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-[45] lg:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.05)] sm:px-4">
        <div className="marketing-sticky-cta__actions mx-auto w-full max-w-lg">
          <Link
            to={secondaryHref}
            className="marketing-btn-secondary min-h-[48px] px-3 text-sm font-semibold"
          >
            <span>{secondaryLabel}</span>
          </Link>
          <Link
            to={href}
            className="marketing-btn-primary min-h-[48px] min-w-0 gap-1.5 px-3 text-sm font-semibold"
            onClick={() =>
              emitProductEvent({
                event: "landing_primary_cta_clicked",
                surface: "marketing_web",
                metadata: { label, to: href, source: "marketing_sticky_cta" },
              })
            }
          >
            <span>{label}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
