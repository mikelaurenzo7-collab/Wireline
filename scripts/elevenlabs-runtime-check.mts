/** Read-only backend key check. No speech, uploads, voice IDs or personal data are emitted. */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

if (!process.env.ELEVENLABS_API_KEY?.trim()) {
  console.error("ELEVENLABS_API_KEY must be configured in the server environment.");
  process.exit(2);
}

try {
  const client = new ElevenLabsClient();
  const user = await client.user.get({ timeoutInSeconds: 10, maxRetries: 0 });
  const expectedWorkspace = process.env.BOTBOUND_ELEVENLABS_WORKSPACE_ID?.trim();
  const workspaceMatches = expectedWorkspace ? user.workspaceId === expectedWorkspace : null;
  console.log(
    JSON.stringify({
      readOnly: true,
      authenticated: true,
      workspaceMatches,
      tier: user.subscription.tier,
      instantCloning: user.subscription.canUseInstantVoiceCloning,
      voiceLimit: user.subscription.voiceLimit,
      voiceSlotsUsed: user.subscription.voiceSlotsUsed,
      remainingCredits: Math.max(
        0,
        user.subscription.characterLimit - user.subscription.characterCount,
      ),
      voiceWorkflowVerified: false,
    }),
  );
  if (workspaceMatches === false) process.exitCode = 1;
} catch {
  // Provider errors can contain request headers or personal account details.
  console.error(
    "ElevenLabs account check failed. Check the server key, scopes and provider status.",
  );
  process.exitCode = 1;
}
