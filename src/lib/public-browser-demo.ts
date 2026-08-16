/** Hard stop for unauthenticated browser voice previews. */
export const PUBLIC_BROWSER_DEMO_MAX_SECONDS = 45 as const;

/** Per-IP request ceiling for minting a protected browser-demo session. */
export const PUBLIC_BROWSER_DEMO_REQUESTS_PER_MINUTE = 6 as const;

/**
 * Public previews are ephemeral proof, not customer records. Vapi enables some
 * artifacts by default when the plan is omitted, so every server-created demo
 * assistant sends the complete privacy posture explicitly.
 */
export function buildPublicBrowserDemoArtifactPlan() {
  return {
    recordingEnabled: false,
    videoRecordingEnabled: false,
    pcapEnabled: false,
    loggingEnabled: false,
    transcriptPlan: { enabled: false },
  } as const;
}
