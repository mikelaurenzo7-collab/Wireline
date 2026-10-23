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
 * Header, footer chrome, and an optional mobile sticky CTA, for pages that
 * bring their own content width: legal, trust, changelog, support.
 *
 * Public routes use normal document scrolling. The measured header reserves
 * its own space; the footer follows the content. Workspace viewport behavior
 * remains independent of this public shell.
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
        authCanvas ? "auth-portal-canvas" : "bg-background",
        className,
      )}
    >
      {authCanvas ? null : <PrecisionPublicHeader />}
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          /* The document owns scrolling. This flow reserves the measured header. */
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
