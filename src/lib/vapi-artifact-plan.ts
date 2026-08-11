export interface VapiArtifactPlan {
  recordingEnabled: boolean;
  videoRecordingEnabled: boolean;
  pcapEnabled: boolean;
  loggingEnabled: boolean;
  transcriptPlan: {
    enabled: boolean;
  };
}

/**
 * Wireline's managed launch posture keeps transcript-driven product features
 * without retaining full-call provider audio or packet captures by default.
 *
 * Vapi's artifactPlan defaults recording and packet capture on when those
 * fields are omitted, so every assistant payload must send this policy
 * explicitly rather than relying on provider defaults.
 */
export function buildVapiTranscriptOnlyArtifactPlan(): VapiArtifactPlan {
  return {
    recordingEnabled: false,
    videoRecordingEnabled: false,
    pcapEnabled: false,
    loggingEnabled: true,
    transcriptPlan: { enabled: true },
  };
}
