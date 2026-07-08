import type { ReactNode } from "react";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import type { PublicNavActive } from "./PublicSiteHeader";
import MarketingFooter from "./MarketingFooter";
import MarketingStickyCta from "./MarketingStickyCta";
import { cn } from "../../lib/utils";

type Props = {
  children: ReactNode;
  active?: PublicNavActive;
  /** Opt-in mobile bottom conversion bar. In-flow CTAs are the default. */
  stickyCta?: boolean;
  footer?: boolean;
  /** Aurora auth canvas (sign-in, reset password) — matches AuthPortal */
  authCanvas?: boolean;
  className?: string;
};

/**
 * Header + optional footer + optional mobile sticky CTA without the full page frame.
 * Use for legal, support, or nested layouts that bring their own content width.
 */
export default function MarketingChrome({
  children,
  stickyCta = false,
  footer = true,
  authCanvas = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-surface min-h-dvh flex flex-col text-foreground",
        authCanvas ? "auth-portal-canvas" : "bg-card",
        className,
      )}
    >
      <PrecisionPublicHeader />
      <div
        id="main-content"
        tabIndex={-1}
        className={cn(
          /* No nested scroller here: the chrome's root div is the scroll
             container (foundation's `.wl-ui-caps >` rule). A second
             overflow-y-auto viewport squeezed long content (legal pages)
             into the space left over by the always-visible footer. */
          "relative z-10 flex-1 flex flex-col",
          /* PublicSiteHeader is fixed h-16 — reserve space so hero copy isn't clipped. */
          !authCanvas && "pt-16 sm:pt-20",
          stickyCta && "marketing-has-sticky-cta",
        )}
      >
        {children}
      </div>
      {footer && <MarketingFooter className="relative z-10 shrink-0" aboveStickyCta={stickyCta} />}
      {stickyCta && <MarketingStickyCta />}
    </div>
  );
}
