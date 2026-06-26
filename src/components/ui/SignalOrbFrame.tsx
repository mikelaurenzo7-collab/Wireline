import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { SignalFrameRail, type SignalFrameSize } from "./SignalFrameRail";

type SignalOrbFrameProps = {
  children: ReactNode;
  className?: string;
  /** Frame diameter preset */
  size?: SignalFrameSize;
  /** Minimal line frame behind the focal mark */
  withConstellation?: boolean;
  /** Soft monochrome bloom behind content */
  withBloom?: boolean;
  /** Calmer frame + bloom for authenticated surfaces (default on) */
  refined?: boolean;
};

/**
 * SignalOrbFrame - centers focal UI inside the shared monochrome frame.
 */
export function SignalOrbFrame({
  children,
  className,
  size = "md",
  withConstellation = false,
  withBloom = false,
  refined = true,
}: SignalOrbFrameProps) {
  return (
    <div
      className={cn(
        "relative isolate inline-flex items-center justify-center rounded-full",
        refined ? "text-foreground" : "text-foreground/80",
        className,
      )}
    >
      {withConstellation ? <SignalFrameRail size={size} refined={refined} /> : null}
      {withBloom ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-1/2 -z-20 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-xl"
        />
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
