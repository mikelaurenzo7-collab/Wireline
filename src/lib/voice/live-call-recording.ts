import { resolveCanonicalAppUrl } from "../app-url";

/**
 * Live-call recording is a per-Bot owner choice (agents.call_recording_enabled,
 * default off). Both live bridges are Twilio <Dial><Sip> legs into the AI
 * provider, so the carrier is the only place the full call audio exists;
 * these attributes make Twilio record the bridged call (dual channel, from
 * answer) and report the finished recording to the webhook that persists
 * it on the call row. The same flag also drives the recording notice in
 * the Bot's spoken opening, so capture and disclosure can never disagree.
 */
export const LIVE_RECORDING_CALLBACK_PATH = "/api/twilio-webhook/live-recording-complete";

function liveRecordingCallbackUrl(): string {
  const canonical = resolveCanonicalAppUrl();
  const baseUrl = "error" in canonical ? "https://botbound.app" : canonical.url;
  return new URL(LIVE_RECORDING_CALLBACK_PATH, `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

/** Extra <Dial> attributes for a recorded bridge; empty when recording is off. */
export function liveRecordingDialAttributes(recordCall: boolean): string {
  if (!recordCall) return "";
  return (
    ` record="record-from-answer-dual"` +
    ` recordingStatusCallback="${liveRecordingCallbackUrl()}"` +
    ` recordingStatusCallbackMethod="POST"` +
    ` recordingStatusCallbackEvent="completed"`
  );
}
