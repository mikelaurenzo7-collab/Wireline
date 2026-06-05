import { describe, it, expect } from "vitest";
import { WL_SIGNAL_CLASSES } from "./wireline-signal-design";

describe("Wireline signal design contract", () => {
  it("exposes stable class hooks for constellation chrome", () => {
    expect(WL_SIGNAL_CLASSES.fleetConstellation).toBe("wl-fleet-constellation");
    expect(WL_SIGNAL_CLASSES.fleetConstellationRefined).toBe("wl-fleet-constellation--refined");
    expect(WL_SIGNAL_CLASSES.signalOrbFrame).toBe("wl-signal-orb-frame");
    expect(WL_SIGNAL_CLASSES.signalOrbRefined).toBe("wl-signal-orb-frame--refined");
    expect(WL_SIGNAL_CLASSES.canvasConstellation).toBe("wl-canvas-constellation");
    expect(WL_SIGNAL_CLASSES.emptyStateSignal).toBe("wl-empty-state--signal");
  });
});