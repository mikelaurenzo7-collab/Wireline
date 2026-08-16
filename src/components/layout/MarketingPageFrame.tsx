import type { ReactNode } from "react";
import { useLocation } from "react-router";
import PrecisionPublicHeader from "../marketing/PrecisionPublicHeader";
import MarketingChromeBar from "../marketing/MarketingChromeBar";
import MarketingStickyCta from "../marketing/MarketingStickyCta";
import { cn } from "../../lib/utils";

type MarketingSectionLink = {
  id: string;
  label: string;
};

interface MarketingPageFrameProps {
  children: ReactNode;
  /**
   * Long-form document pages (legal, changelog, blog) opt out of panel-style
   * section composition and keep one honest reading column. Public routes still
   * use the browser document as their sole scroll owner.
   */
  longform?: boolean;
  /** Opt-in mobile bottom conversion bar. Public pages already carry in-flow CTAs. */
  stickyCta?: boolean;
  footer?: boolean;
  className?: string;
  mainClassName?: string;
  sectionLinks?: MarketingSectionLink[];
}

/**
 * Shared shell for public marketing pages.
 *
 * Public routes use normal document scrolling. The fixed header, relative
 * footer chrome, route-mode root, and section primitives are reconciled by
 * `marketing-document-flow.css`, which intentionally loads after the older
 * viewport-first base layer. That final route-mode layer is the effective
 * contract; the base file remains only as shared composition geometry.
 * Workspace routes retain their fixed-viewport, bounded-scroll ownership.
 */
export default function MarketingPageFrame({
  children,
  longform = false,
  stickyCta = false,
  footer = true,
  className,
  mainClassName,
  sectionLinks,
}: MarketingPageFrameProps) {
  const location = useLocation();
  const activeSection = location.hash.replace(/^#/, "") || sectionLinks?.[0]?.id;

  return (
    <div className={cn("marketing-surface bg-background text-foreground", className)}>
      <PrecisionPublicHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "marketing-flow relative z-10",
          stickyCta && "marketing-has-sticky-cta",
          mainClassName,
        )}
      >
        {sectionLinks && sectionLinks.length > 0 ? (
          // `top-0` is relative to the flow's padded document position, so the
          // strip stays immediately below the fixed public header without a
          // second hard-coded header offset.
          <div className="sticky top-0 z-20 border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_94%,transparent)] px-5 py-2 backdrop-blur-xl lg:px-8">
            <nav
              aria-label="On this page"
              className="wl-measure flex items-center gap-2 overflow-x-auto tab-strip-scroll"
            >
              <span className="wl-overline shrink-0">On this page</span>
              {sectionLinks.map((link) => {
                const active = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "touch-press shrink-0 rounded-full border px-3 py-1.5 text-[length:var(--wireline-typography-caption-size)] font-medium transition-colors",
                      active
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          </div>
        ) : null}
        {/* Children are not wrapped in a section: pages compose their own
            `.marketing-section` panels, because only the page knows where one
            story unit ends and the next begins. The document-mode stylesheet
            lets those sections size naturally while preserving the shared
            frame, typography, and alignment primitives. */}
        <div className={cn("marketing-frame-stack", longform && "marketing-longform")}>
          {children}
        </div>
      </main>

      {footer ? <MarketingChromeBar /> : null}
      {stickyCta ? <MarketingStickyCta /> : null}
    </div>
  );
}
