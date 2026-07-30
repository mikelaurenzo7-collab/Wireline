import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { emitProductEvent } from "../../lib/product-event-client";
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
  label = "Build your agent",
  secondaryHref,
  secondaryLabel,
  className,
}: Props) {
  const [visible, setVisible] = useState(false);

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

  const showSecondary = Boolean(secondaryHref && secondaryLabel);

  return (
    <div
      className={cn(
        "marketing-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-[45] lg:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto border-t border-border bg-card/96 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pt-2 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.08)] backdrop-blur-xl sm:px-4">
        <div className={cn("mx-auto flex items-center gap-2", showSecondary ? "max-w-lg" : "max-w-sm")}>
          {showSecondary ? (
            <Link
              to={secondaryHref!}
              className="inline-flex min-h-11 min-w-0 flex-1 items-center justify-center px-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {secondaryLabel}
            </Link>
          ) : null}
          <Link
            to={href}
            className={cn(
              "marketing-btn-primary min-h-11 min-w-0 gap-1.5 px-4 text-sm font-semibold",
              showSecondary ? "flex-[1.35]" : "w-full justify-center",
            )}
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
