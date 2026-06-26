/*
 * Legacy class-name bridge.
 *
 * This file exists only to keep older components compiling while the app
 * completes its migration to Wireline Mono. Do not add new imports here.
 */

export const WL_SIGNAL_CLASSES = {
  fleetConstellation: "wl-Assistants-constellation",
  fleetConstellationRefined: "wl-Assistants-constellation--refined",
  signalOrbFrame: "wl-signal-orb-frame",
  signalOrbRefined: "wl-signal-orb-frame--refined",
  canvasConstellation: "wl-canvas-constellation",
  emptyStateSignal: "wl-empty-state--signal",
} as const;
