import type { ReactNode } from "react";
import PublicSiteHeader, { type PublicNavActive } from "./PublicSiteHeader";
import MarketingFooter from "./MarketingFooter";
import MarketingStickyCta from "./MarketingStickyCta";
import MarketingAuroraBackdrop from "./MarketingAuroraBackdrop";
import { cn } from "../../lib/utils";

type Props = {
  children: ReactNode;
  active?: PublicNavActive;
  /** Reserve space for the mobile sticky CTA bar */
  stickyCta?: boolean;
  footer?: boolean;
  /** Rich cream canvas (sign-in, reset password) — matches AuthPortal */
  authCanvas?: boolean;
  className?: string;
};

/**
 * Header + optional footer + mobile sticky CTA without the full page frame.
 * Use for legal, support, or nested layouts that bring their own content width.
 */
export default function MarketingChrome({
  children,
  active,
  stickyCta = true,
  footer = true,
  authCanvas = false,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "marketing-surface min-h-dvh flex flex-col text-ink",
        authCanvas ? "auth-portal-canvas" : "bg-paper",
        className,
      )}
    >
      {!authCanvas && <MarketingAuroraBackdrop />}
      <PublicSiteHeader active={active} />
      <div
        id="main-content"
        tabIndex={-1}
        className={cn(
          "relative z-10 flex-1 flex flex-col min-h-0 overflow-y-auto scroll-viewport",
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
