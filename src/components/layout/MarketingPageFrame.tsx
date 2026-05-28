import type { ReactNode } from "react";
import { motion } from "motion/react";
import PublicSiteHeader, { type PublicNavActive } from "../marketing/PublicSiteHeader";
import { cn } from "../../lib/utils";

interface MarketingPageFrameProps {
  children: ReactNode;
  /** Nav highlight for PublicSiteHeader */
  active?: PublicNavActive;
  /** Fixed viewport (landing-style) vs scrollable long-form */
  scroll?: boolean;
  className?: string;
  mainClassName?: string;
}

/**
 * Shared shell for public marketing pages — typography, aurora, nav.
 */
export default function MarketingPageFrame({
  children,
  active,
  scroll = true,
  className,
  mainClassName,
}: MarketingPageFrameProps) {
  return (
    <div
      className={cn(
        "marketing-surface relative bg-paper text-ink",
        scroll ? "min-h-dvh" : "h-dvh max-h-dvh flex flex-col overflow-hidden",
        className,
      )}
    >
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <motion.div
          className="absolute -top-[22%] -left-[12%] w-[min(520px,48vw)] h-[min(520px,48vw)] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(79,30,123,0.11), transparent 68%)",
            filter: "blur(42px)",
          }}
          animate={{ x: [0, 18, 0], y: [0, -12, 0] }}
          transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-[18%] -right-[10%] w-[min(440px,42vw)] h-[min(440px,42vw)] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(217,119,82,0.09), transparent 70%)",
            filter: "blur(48px)",
          }}
          animate={{ x: [0, -14, 0], y: [0, 10, 0] }}
          transition={{ duration: 28, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <PublicSiteHeader active={active} />

      <main
        className={cn(
          "relative z-10",
          scroll ? "px-5 py-8 md:py-12 lg:px-8 pb-16" : "flex-1 min-h-0 px-5 pb-4 lg:px-8 lg:pb-6",
          mainClassName,
        )}
      >
        <div className={cn(scroll && "max-w-[1200px] mx-auto")}>{children}</div>
      </main>
    </div>
  );
}
