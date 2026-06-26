import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { WL_SIGNAL_CLASSES } from "../../lib/wireline-signal-design";
import { AssistantConstellation, type AssistantConstellationSize } from "./AssistantConstellation";

type SignalOrbFrameProps = {
  children: ReactNode;
  className?: string;
  /** Orbit diameter preset */
  size?: AssistantConstellationSize;
  /** Minimal orbit frame behind the focal orb */
  withConstellation?: boolean;
  /** Soft brand bloom behind content (Director hero) */
  withBloom?: boolean;
  /** Calmer orbit frame + bloom for authenticated surfaces (default on) */
  refined?: boolean;
};

/**
 * SignalOrbFrame — centers focal UI inside the shared monochrome orbit frame.
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
        WL_SIGNAL_CLASSES.signalOrbFrame,
        refined && WL_SIGNAL_CLASSES.signalOrbRefined,
        className,
      )}
    >
      {withConstellation ? <AssistantConstellation size={size} refined={refined} /> : null}
      {withBloom ? <div aria-hidden className="wl-signal-orb-bloom" /> : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
