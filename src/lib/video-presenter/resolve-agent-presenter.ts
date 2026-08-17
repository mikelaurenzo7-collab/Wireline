/**
 * Resolve per-agent video presenter policy. Live talking-head providers are
 * retired; every agent keeps the Wireline identity badge.
 */
import { buildAgentIdentityPreview, type VideoPresenterProviderId } from "../agent-identity";
import { getLiveAvatarStatus } from "./liveavatar-service";
import { videoPresenterStatusMessage } from "./copy";
import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";

function normalizeConsent(value: string | null | undefined): VideoPresenterConsentStatus {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  return "not_started";
}

export { businessAgentVideoPresenterDefaults } from "./liveavatar-service";

export function resolveAgentVideoPresenter(input: {
  id: string;
  name: string;
  role?: string | null;
  isBusinessAgent?: boolean;
  videoPresenterProvider?: string | null;
  videoPresenterAvatarId?: string | null;
  videoPresenterConsentStatus?: string | null;
}): AgentVideoPresenterConfig {
  const identity = buildAgentIdentityPreview({
    id: input.id,
    name: input.name,
    role: input.role,
    isBusinessAgent: input.isBusinessAgent,
  });

  const providerPreference: VideoPresenterProviderId = "synthetic";
  const liveAvatar = getLiveAvatarStatus();
  const chosenAvatarId = input.videoPresenterAvatarId?.trim() || null;
  const consentStatus = normalizeConsent(input.videoPresenterConsentStatus);

  return {
    provider: providerPreference,
    chosenAvatarId,
    avatarId: null,
    avatarSource: chosenAvatarId ? "agent" : "none",
    consentStatus,
    status: "disabled",
    platformConfigured: liveAvatar.configured,
    headline: "Wireline identity",
    description: videoPresenterStatusMessage(
      {
        provider: providerPreference,
        chosenAvatarId,
        avatarId: null,
        avatarSource: chosenAvatarId ? "agent" : "none",
        consentStatus,
        status: "disabled",
        headline: identity.video.headline,
        description: identity.video.description,
      },
      liveAvatar.configured,
      input.isBusinessAgent === true,
    ),
  };
}
