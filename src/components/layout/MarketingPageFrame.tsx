import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import PrecisionPublicHeader from "../marketing/PrecisionPublicHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import MarketingStickyCta from "../marketing/MarketingStickyCta";
import { cn } from "../../lib/utils";

type MarketingSectionLink = {
  id: string;
  label: string;
};

interface MarketingPageFrameProps {
  children: ReactNode;
  /** Fixed viewport (landing-style) vs scrollable long-form */
  scroll?: boolean;
  /** Opt-in mobile bottom conversion bar. Public pages already carry in-flow CTAs. */
  stickyCta?: boolean;
  footer?: boolean;
  className?: string;
  mainClassName?: string;
  sectionLinks?: MarketingSectionLink[];
}

/** Shared shell for public marketing pages — fixed chrome, consistent rhythm, and one footer. */
export default function MarketingPageFrame({
  children,
  scroll = true,
  stickyCta = false,
  footer = true,
  className,
  mainClassName,
  sectionLinks,
}: MarketingPageFrameProps) {
  const location = useLocation();
  const activeSection = location.hash.replace(/^#/, "") || sectionLinks?.[0]?.id;

  return (
    <div
      className={cn(
        "marketing-surface relative flex flex-col bg-background text-foreground",
        scroll ? "min-h-dvh" : "h-dvh max-h-dvh overflow-hidden",
        className,
      )}
    >
      <PrecisionPublicHeader />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "relative z-10",
          scroll ? "grow" : "min-h-0 flex-1",
          scroll ? "scroll-viewport" : "flex flex-col overflow-hidden",
          stickyCta && scroll && "marketing-has-sticky-cta",
          scroll
            ? "px-4 pb-8 pt-20 sm:px-5 sm:pb-10 sm:pt-24 md:px-8 md:pb-12 md:pt-28 lg:px-12 xl:px-16 2xl:px-20"
            : "px-4 pb-4 pt-16 sm:px-5 lg:px-8 lg:pb-6",
          mainClassName,
        )}
      >
        {sectionLinks && sectionLinks.length > 0 ? (
          <div className="sticky top-16 z-20 -mx-5 mb-6 border-y border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_94%,transparent)] px-5 py-2.5 backdrop-blur-xl md:-mx-8 md:px-8 lg:-mx-12 lg:px-12">
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
                      "touch-press shrink-0 rounded-full border px-3 py-1.5 text-[var(--wireline-typography-caption-size)] font-medium transition-colors",
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
        <div className={cn(scroll && "wl-measure", "resp-adaptive-grid")}>{children}</div>
      </main>

      {footer ? (
        <MarketingFooter className="relative z-10 shrink-0" aboveStickyCta={stickyCta && scroll} />
      ) : null}
      {stickyCta && scroll ? <MarketingStickyCta /> : null}
    </div>
  );
}
