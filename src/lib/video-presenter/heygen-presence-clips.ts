/**
 * HeyGen Video Agent — pre-rendered presence clips, not live video.
 *
 * `POST /v3/video-agents` (and classic `POST /v3/videos`) take a prompt or
 * script and return an MP4 minutes later. That is a real creative supply line
 * for recaps, proposals, explainers, and kiosk loops. It is not a conversation:
 * there is no turn-taking, no interruption, and the provider writes the script
 * unless the prompt already contains one.
 *
 * Live Video stays on LiveAvatar LITE (`api.liveavatar.com`) with the tenant
 * agent's Training, tools, and voice. HeyGen look IDs (`Abigail_expressive_…`)
 * are not LiveAvatar session UUIDs; minting them on Live Video fails.
 *
 * Credits do not transfer. Video Agent spend hits the shared `HEYGEN_API_KEY`
 * wallet (~$0.0333/sec of finished video). Live sessions hit
 * `LIVEAVATAR_API_KEY`. Until per-tenant billing exists, minting stays
 * fail-closed so one tenant cannot burn the workspace wallet.
 */
import { AppError } from "../api-error";

function heygenApiKey(): string | null {
  return process.env.HEYGEN_API_KEY?.trim() || null;
}

export function presenceClipsConfigured(): boolean {
  return Boolean(heygenApiKey());
}

/**
 * Operator intent flag. Reserved for a future founder/tooling path.
 * HTTP routes must not treat this as permission to mint.
 */
export function presenceClipSpendRequested(): boolean {
  return process.env.WIRELINE_PRESENCE_CLIPS_ENABLED === "true";
}

/**
 * Tenant and Studio minting is not offered. Hard false even when the key and
 * the env flag are present — shared-wallet spend is a multi-tenant blocker.
 */
export function presenceClipMintOffered(): boolean {
  return false;
}

export type PresenceClipCapability = {
  configured: boolean;
  spendRequested: boolean;
  mintOffered: false;
};

export function describePresenceClipCapability(): PresenceClipCapability {
  return {
    configured: presenceClipsConfigured(),
    spendRequested: presenceClipSpendRequested(),
    mintOffered: false,
  };
}

/** Customer-safe refusal if a future route is wired before billing exists. */
export function assertPresenceClipMintNotOffered(): void {
  if (presenceClipMintOffered()) return;
  throw AppError.fromHttpStatus(
    503,
    "Presence clips are not available yet. Live Video and phone are unaffected.",
  );
}
