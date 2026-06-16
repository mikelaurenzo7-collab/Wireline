import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import PublicSiteHeader, { type PublicNavActive } from "../marketing/PublicSiteHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import MarketingStickyCta from "../marketing/MarketingStickyCta";
import { cn } from "../../lib/utils";

type MarketingSectionLink = {
  id: string;
  label: string;
};

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
  sectionLinks?: MarketingSectionLink[];
}

/**
 * Shared shell for public marketing pages — typography, nav, footer.
 */
export default function MarketingPageFrame({
  children,
  active,
  scroll = true,
  stickyCta = true,
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
        "marketing-surface relative bg-paper text-ink flex flex-col paper-texture",
        scroll ? "min-h-dvh" : "h-dvh max-h-dvh overflow-hidden",
        className,
      )}
    >
      <PublicSiteHeader active={active} />

      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "relative z-10 flex-1 min-h-0",
          scroll ? "scroll-viewport" : "overflow-hidden flex flex-col",
          stickyCta && scroll && "marketing-has-sticky-cta",
          scroll
            ? "px-5 py-8 md:py-12 lg:px-8 xl:px-12 2xl:px-16"
            : "px-5 pb-4 lg:px-8 xl:px-12 lg:pb-6",
          mainClassName,
        )}
      >
        {sectionLinks && sectionLinks.length > 0 && (
          <div className="sticky top-0 z-20 -mx-5 mb-6 border-y border-ink/[0.08] bg-paper/80 backdrop-blur-md px-5 py-2.5 md:-mx-8 md:px-8">
            <nav
              aria-label="On this page"
              className="wl-measure flex items-center gap-2 overflow-x-auto tab-strip-scroll"
            >
              <span className="shrink-0 wl-label text-ink/45">On this page</span>
              {sectionLinks.map((link) => {
                const active = activeSection === link.id;
                return (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "touch-press shrink-0 rounded-md border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors",
                      active
                        ? "border-brand/25 bg-brand/10 text-brand"
                        : "border-black/8 bg-paper/70 text-ink/60 hover:border-brand/20 hover:text-ink",
                    )}
                  >
                    {link.label}
                  </a>
                );
              })}
            </nav>
          </div>
        )}
        <div className={cn(scroll && "wl-measure")}>{children}</div>
      </main>

      {footer && (
        <MarketingFooter className="relative z-10 shrink-0" aboveStickyCta={stickyCta && scroll} />
      )}
      {stickyCta && scroll && <MarketingStickyCta />}
    </div>
  );
}
