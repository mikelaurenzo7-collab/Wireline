import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";
import {
  LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY,
  LIVE_VIDEO_SESSION_RESERVATION_MINUTES,
} from "./live-video-policy";

/** Customer-facing copy never exposes the underlying video provider. */
export function videoPresenterStatusMessage(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
  isBusinessAgent: boolean,
): string {
  if (!isBusinessAgent) {
    return "Personal agents use a private in-app identity badge. Live Video is available for business agents.";
  }
  if (!platformConfigured) return "Live Video is not available on this workspace yet.";
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) {
      return "Presenter saved. Add Live Video to stream this face while keeping the in-app identity badge as fallback.";
    }
    return "Choose a presenter, then add Live Video when you want this business agent on screen.";
  }
  if (presenter.avatarSource === "agent" && presenter.status === "ready") {
    return "Live Video is ready for this agent. The in-app identity badge remains the always-on fallback.";
  }
  if (presenter.status === "ready" && presenter.avatarSource === "workspace_default") {
    return "Live Video is using your workspace default presenter. Pick another face any time.";
  }
  if (presenter.status === "ready") {
    return "Live Video is active. The in-app identity badge remains the always-on fallback.";
  }
  if (presenter.consentStatus === "pending") {
    return "Custom presenter approval is in review. Catalog presenters remain available while it clears.";
  }
  if (presenter.consentStatus === "rejected") {
    return "Custom presenter was not approved. Choose an approved catalog presenter or contact support.";
  }
  if (!presenter.chosenAvatarId && !presenter.avatarId) {
    return "Choose a presenter face to finish Live Video setup.";
  }
  return "Finish Live Video setup to start a presenter session.";
}

export function videoPresenterPreviewHint(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
): string {
  if (!platformConfigured) return "Live Video preview is unavailable on this workspace.";
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) {
      return "Your presenter is saved. Add Live Video to start a streaming preview.";
    }
    return "Choose a presenter face, then add Live Video to preview it with your agent voice.";
  }
  if (presenter.status === "ready" && presenter.avatarSource === "workspace_default") {
    return "Preview your workspace presenter or choose another face below.";
  }
  if (presenter.status === "ready") {
    return "Preview the live stream, then hear your agent voice drive lip-sync on video.";
  }
  return "Finish presenter setup to start a Live Video preview.";
}

export function liveVideoAddonPitch(): string {
  return `Put a business agent on screen for demos, recaps, kiosks, support, and selected web experiences. Includes ${LIVE_VIDEO_INCLUDED_MINUTES_MONTHLY} reserved Live Video minutes each month.`;
}

/** Shown on the live-video add-on card — sets reservation expectations without vendor jargon. */
export function liveVideoMeteringNote(): string {
  return `Each session reserves up to ${LIVE_VIDEO_SESSION_RESERVATION_MINUTES} minutes. No automatic overage; Live Video pauses at the monthly allowance.`;
}

export function presenterCustomizationMessage(presenter: AgentVideoPresenterConfig): string | null {
  if (presenter.chosenAvatarId) return "Saved catalog pick";
  if (presenter.avatarSource === "workspace_default") return "Workspace default presenter";
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
      return "Not set";
  }
}
