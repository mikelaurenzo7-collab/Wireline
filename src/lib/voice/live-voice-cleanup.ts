import { AppError } from "../api-error";
import { hangupOpenAIRealtimeCall } from "./openai-realtime-call-control";
import { verifyLiveVoiceCleanupToken } from "./live-voice-cleanup-token";

/** Only an authenticated owner can end the exact private call minted for them. */
export async function stopOpenAILiveVoiceCall(input: { userId: string; cleanupToken: string }) {
  let claims;
  try {
    claims = verifyLiveVoiceCleanupToken(input.cleanupToken, { userId: input.userId });
  } catch {
    throw AppError.serviceUnavailable("Voice rehearsal cleanup is temporarily unavailable.");
  }
  if (!claims)
    throw AppError.badRequest("This voice rehearsal cleanup ticket is invalid or expired.");
  try {
    await hangupOpenAIRealtimeCall({
      callId: claims.callId,
      keyPurpose: "runtime",
      keySource: "runtime",
      expectedKeyFingerprint: claims.keyFingerprint,
    });
  } catch {
    throw AppError.serviceUnavailable(
      "The provider did not confirm the rehearsal ended. Its automatic deadline remains active.",
    );
  }
  return { stopped: true } as const;
}
