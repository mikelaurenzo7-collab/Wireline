import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";

/** Customer-facing copy never exposes the underlying video provider. */
export function videoPresenterStatusMessage(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
  isBusinessAgent: boolean,
): string {
  if (!isBusinessAgent) {
    return "Personal agents use a private in-app identity badge. Video presenters stay off by default.";
  }
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) {
      return "Saved presenter pick retained for future migration. For launch, the avatar stays app-only until the curated Presence Catalog is ready.";
    }
    return "Use the in-app identity badge for Studio, training, analytics, and call logs. Professional video presence is paused until the curated catalog is launch-quality.";
  }
  if (!platformConfigured) return "Professional video presence is not available on this workspace yet.";
  if (presenter.avatarSource === "agent" && presenter.status === "ready") {
    return "Live video is configured for this agent. The in-app identity badge remains the always-on fallback.";
  }
  if (presenter.status === "ready" && presenter.avatarSource === "workspace_default") {
    return "Live video is using your workspace default presenter. Custom catalog selection is paused until the curated Presence Catalog is ready.";
  }
  if (presenter.status === "ready") {
    return "Live video is active. The in-app identity badge remains the always-on fallback.";
  }
  if (presenter.consentStatus === "pending") {
    return "Custom presenter approval is in review. The identity badge covers every app surface until it clears.";
  }
  if (presenter.consentStatus === "rejected") {
    return "Custom presenter was not approved. The identity badge remains active; contact support for the next approved Presence path.";
  }
  if (!presenter.chosenAvatarId && !presenter.avatarId) {
    return "Professional and character presenters are paused until the curated Presence Catalog is ready.";
  }
  return "Finish presenter setup after the curated Presence Catalog is ready.";
}

export function videoPresenterPreviewHint(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
): string {
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) {
      return "Saved presenter pick retained. Streaming preview returns with the curated Presence Catalog.";
    }
    return "The avatar shown here is an app identity badge, not a video presenter. Streaming preview returns with curated Professional / Character Presence.";
  }
  if (presenter.status === "ready" && platformConfigured) {
    if (presenter.avatarSource === "workspace_default") {
      return "Preview uses your workspace default until the curated catalog picker returns.";
    }
    return "Preview the live stream, then hear your agent voice drive lip-sync on video.";
  }
  if (!platformConfigured) {
    return "Live video preview unlocks after the curated Presence Catalog and add-on are ready.";
  }
  return "Professional video preview is paused until the curated Presence Catalog is ready.";
}

export function liveVideoAddonPitch(): string {
  return "Professional video presence for demos, explainers, recaps, content, kiosks, and selected web experiences. The current in-app avatar is only an identifier; Add live video should return after the curated human/character catalog is ready.";
}

/** Shown on the live-video add-on card — sets metering expectations without vendor jargon. */
export function liveVideoMeteringNote(): string {
  return "Metering starts only while a live presenter preview is connected.";
}

export function presenterCustomizationMessage(presenter: AgentVideoPresenterConfig): string | null {
  if (presenter.chosenAvatarId) return "Saved catalog pick";
  if (presenter.avatarSource === "workspace_default") {
    return "Workspace default retained for future migration.";
  }
  return null;
}

export function consentLabel(status: VideoPresenterConsentStatus): string {
  switch (status) {
    case "approved":
      return "Saved";
    case "pending":
      return "Review pending";
    case "rejected":
      return "Not approved";
    default:
      return "Paused";
  }
}
