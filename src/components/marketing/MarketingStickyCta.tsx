import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { emitProductEvent } from "../../lib/product-event-client";
import { MARKETING_VOICE } from "../../lib/product-copy";
import { signupHrefForPlan } from "../../lib/signup-intent";
import { cn } from "../../lib/utils";

type Props = {
  href?: string;
  label?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  className?: string;
};

export default function MarketingStickyCta({
  href = signupHrefForPlan("personal"),
  label = MARKETING_VOICE.primaryCta,
  secondaryHref = "/features",
  secondaryLabel = "How It Works",
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

  useEffect(() => {
    try {
      const root = typeof document === "undefined" ? null : document.documentElement;
      if (!root?.dataset) return;

      const media =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? window.matchMedia("(min-width: 1024px)")
          : null;

      const sync = () => {
        const desktopHidden = Boolean(media?.matches);
        if (!visible || desktopHidden) {
          delete root.dataset.wlStickyCta;
          return;
        }
        root.dataset.wlStickyCta = "open";
      };

      sync();
      media?.addEventListener?.("change", sync);
      return () => {
        media?.removeEventListener?.("change", sync);
        delete root.dataset.wlStickyCta;
      };
    } catch {
      return;
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "marketing-sticky-cta pointer-events-none fixed inset-x-0 bottom-0 z-[45] lg:hidden",
        className,
      )}
    >
      <div className="pointer-events-auto border-t border-border bg-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,0.05)] sm:px-4">
        {/* Secondary hugs its label so the primary CTA never ellipsizes at 360-430px.
         * Phone marketing buttons default to width:100%; the sticky row must opt out
         * or "How It Works" consumes the bar and clips Start Free. */}
        <div className="mx-auto flex w-full max-w-lg flex-nowrap items-stretch gap-2">
          <Link
            to={secondaryHref}
            className="marketing-btn-secondary min-h-[48px] w-auto max-w-[min(100%,11.75rem)] shrink-0 px-3.5 text-sm font-semibold"
          >
            <span>{secondaryLabel}</span>
          </Link>
          <Link
            to={href}
            className="marketing-btn-primary min-h-[48px] w-auto min-w-0 flex-1 gap-1.5 px-3 text-sm font-semibold"
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
