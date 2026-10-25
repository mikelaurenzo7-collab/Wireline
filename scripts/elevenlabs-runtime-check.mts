/** Read-only backend key check. No speech, uploads, voice IDs or personal data are emitted. */
import { z } from "zod";

const accountResponse = z.object({
  workspace_id: z.string(),
  subscription: z.object({
    tier: z.string(),
    can_use_instant_voice_cloning: z.boolean(),
    voice_limit: z.number().finite(),
    voice_slots_used: z.number().finite(),
    character_limit: z.number().finite(),
    character_count: z.number().finite(),
  }),
});

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();

if (!apiKey) {
  console.error("ELEVENLABS_API_KEY must be configured in the server environment.");
  process.exit(2);
}

try {
  const response = await fetch("https://api.elevenlabs.io/v1/user", {
    method: "GET",
    headers: { "xi-api-key": apiKey },
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Account request failed.");
  const user = accountResponse.parse(await response.json());
  const expectedWorkspace = process.env.BOTBOUND_ELEVENLABS_WORKSPACE_ID?.trim();
  const workspaceMatches = expectedWorkspace ? user.workspace_id === expectedWorkspace : null;
  console.log(
    JSON.stringify({
      readOnly: true,
      authenticated: true,
      workspaceMatches,
      tier: user.subscription.tier,
      instantCloning: user.subscription.can_use_instant_voice_cloning,
      voiceLimit: user.subscription.voice_limit,
      voiceSlotsUsed: user.subscription.voice_slots_used,
      remainingCredits: Math.max(
        0,
        user.subscription.character_limit - user.subscription.character_count,
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
