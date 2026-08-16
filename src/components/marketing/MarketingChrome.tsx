import type { ReactNode } from "react";
import PrecisionPublicHeader from "./PrecisionPublicHeader";
import MarketingChromeBar from "./MarketingChromeBar";
import MarketingStickyCta from "./MarketingStickyCta";
import { cn } from "../../lib/utils";

type Props = {
  children: ReactNode;
  /** Opt-in mobile bottom conversion bar. In-flow CTAs are the default. */
  stickyCta?: boolean;
  footer?: boolean;
  /** Aurora auth canvas (sign-in, reset password) — matches AuthPortal */
  authCanvas?: boolean;
  className?: string;
};

/**
 * Header, pinned chrome bar, and an optional mobile sticky CTA, for pages that
 * bring their own content width: legal, trust, status, changelog, support.
 *
 * These are the long-form routes, and they are exactly why the frame is a frame
 * rather than a per-page decision. A terms-of-service page has to scroll; what
 * it must not do is scroll the *window*, because then the header detaches, the
 * chrome bar drops off the bottom, and the route stops matching every other
 * public page. So it gets the same 100dvh surface as the composed pages, and
 * the document flows inside the same single `.marketing-flow` scroller.
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
        "marketing-surface text-foreground",
        authCanvas ? "auth-portal-canvas" : "bg-card",
        className,
      )}
    >
      <PrecisionPublicHeader />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          /* One scroller, and it is this one. The header offset is authored on
             `.marketing-flow` itself, so no page reserves h-16 of its own. */
          "marketing-flow marketing-longform relative z-10 flex flex-col",
          stickyCta && "marketing-has-sticky-cta",
        )}
      >
        {children}
      </main>
      {footer && <MarketingChromeBar />}
      {stickyCta && <MarketingStickyCta />}
    </div>
  );
}
