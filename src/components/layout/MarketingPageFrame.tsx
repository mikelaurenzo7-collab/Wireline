import type { ReactNode } from "react";
import PublicSiteHeader, { type PublicNavActive } from "../marketing/PublicSiteHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import MarketingStickyCta from "../marketing/MarketingStickyCta";
import MarketingAuroraBackdrop from "../marketing/MarketingAuroraBackdrop";
import { cn } from "../../lib/utils";

interface MarketingPageFrameProps {
  children: ReactNode;
  /** Nav highlight for PublicSiteHeader */
  active?: PublicNavActive;
  /** Fixed viewport (landing-style) vs scrollable long-form */
  scroll?: boolean;
  /** Mobile bottom conversion bar */
  stickyCta?: boolean;
  footer?: boolean;
  className?: string;
  mainClassName?: string;
}

/**
 * Shared shell for public marketing pages — typography, aurora, nav, footer.
 */
export default function MarketingPageFrame({
  children,
  active,
  scroll = true,
  stickyCta = true,
  footer = true,
  className,
  mainClassName,
}: MarketingPageFrameProps) {
  return (
    <div
      className={cn(
        "marketing-surface relative bg-paper text-ink flex flex-col",
        scroll ? "min-h-dvh" : "h-dvh max-h-dvh overflow-hidden",
        className,
      )}
    >
      <MarketingAuroraBackdrop />
      <PublicSiteHeader active={active} />

      <main
        className={cn(
          "relative z-10 flex-1 min-h-0",
          scroll ? "overflow-y-auto" : "overflow-hidden flex flex-col",
          stickyCta && scroll && "marketing-has-sticky-cta",
          scroll ? "px-5 py-8 md:py-12 lg:px-8" : "px-5 pb-4 lg:px-8 lg:pb-6",
          mainClassName,
        )}
      >
        <div className={cn(scroll && "max-w-[1200px] mx-auto w-full")}>{children}</div>
      </main>

      {footer && <MarketingFooter className="relative z-10 shrink-0" />}
      {stickyCta && scroll && <MarketingStickyCta />}
    </div>
  );
}
