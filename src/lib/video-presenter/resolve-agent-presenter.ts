/**
 * Resolve per-agent video presenter policy + runtime readiness.
 */
import { buildAgentIdentityPreview, type VideoPresenterProviderId } from "../agent-identity";
import { getLiveAvatarStatus } from "./liveavatar-service";
import { videoPresenterStatusMessage } from "./copy";
import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";

const LIVEAVATAR_ALIASES = new Set<VideoPresenterProviderId>(["heygen", "liveavatar"]);

function normalizeConsent(value: string | null | undefined): VideoPresenterConsentStatus {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  return "not_started";
}

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

  const providerPreference =
    (input.videoPresenterProvider as VideoPresenterProviderId | null) ||
    identity.video.providerPreference;
  const liveAvatar = getLiveAvatarStatus();
  const usesLiveAvatar = LIVEAVATAR_ALIASES.has(providerPreference);
  const chosenAvatarId = input.videoPresenterAvatarId?.trim() || null;
  const workspaceDefaultId = liveAvatar.defaultAvatarId;
  const avatarId = usesLiveAvatar ? chosenAvatarId || workspaceDefaultId : null;
  const avatarSource: AgentVideoPresenterConfig["avatarSource"] = chosenAvatarId
    ? "agent"
    : usesLiveAvatar && workspaceDefaultId
      ? "workspace_default"
      : "none";
  const consentStatus = normalizeConsent(input.videoPresenterConsentStatus);

  const catalogReady = usesLiveAvatar && liveAvatar.configured && Boolean(avatarId);
  const consentBlocked = usesLiveAvatar && consentStatus === "rejected";

  let status: AgentVideoPresenterConfig["status"] = "not_configured";
  if (providerPreference === "synthetic" || !usesLiveAvatar) {
    status = "disabled";
  } else if (consentBlocked) {
    status = "error";
  } else if (catalogReady && consentStatus !== "pending") {
    status = "ready";
  }

  return {
    provider: providerPreference,
    chosenAvatarId,
    avatarId,
    avatarSource,
    consentStatus,
    status,
    platformConfigured: liveAvatar.configured,
    headline:
      status === "ready"
        ? avatarSource === "agent"
          ? "Custom presenter locked in"
          : "Live video slot ready"
        : status === "disabled" && chosenAvatarId
          ? "Presenter face chosen"
          : status === "disabled"
            ? "Wireline face"
            : identity.video.headline,
    description: videoPresenterStatusMessage(
      {
        provider: providerPreference,
        avatarId,
        avatarSource,
        consentStatus,
        status,
        headline: identity.video.headline,
        description: identity.video.description,
      },
      liveAvatar.configured,
      input.isBusinessAgent === true,
    ),
  };
}
