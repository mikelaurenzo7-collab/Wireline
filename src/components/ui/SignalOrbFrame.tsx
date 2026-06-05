import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { WL_SIGNAL_CLASSES } from "../../lib/wireline-signal-design";
import { FleetConstellation, type FleetConstellationSize } from "./FleetConstellation";

type SignalOrbFrameProps = {
  children: ReactNode;
  className?: string;
  /** Constellation diameter preset */
  size?: FleetConstellationSize;
  /** Dormant fleet nodes behind the focal orb */
  withConstellation?: boolean;
  /** Soft brand bloom behind content (Director hero) */
  withBloom?: boolean;
  /** Calmer constellation + bloom for authenticated surfaces (default on) */
  refined?: boolean;
};

/**
 * SignalOrbFrame — centers focal UI (Medallion, compass, loading dots) inside
 * the shared fleet constellation motif.
 */
export function SignalOrbFrame({
  children,
  className,
  size = "md",
  withConstellation = true,
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
      {withConstellation ? <FleetConstellation size={size} refined={refined} /> : null}
      {withBloom ? (
        <div aria-hidden className="wl-signal-orb-bloom" />
      ) : null}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}