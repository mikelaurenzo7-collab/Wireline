import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";

/** Customer-facing copy never exposes the underlying video provider. */
export function videoPresenterStatusMessage(
  presenter: AgentVideoPresenterConfig,
  _platformConfigured: boolean,
  isBusinessAgent: boolean,
): string {
  if (!isBusinessAgent) {
    return "Personal agents use a private in-app identity badge.";
  }
  if (presenter.chosenAvatarId) {
    return "This agent keeps its identity badge. Live talking-head video is retired.";
  }
  return "Identity badges stay on every agent. Live talking-head video is retired.";
}

export function videoPresenterPreviewHint(
  _presenter: AgentVideoPresenterConfig,
  _platformConfigured: boolean,
): string {
  return "Live talking-head preview is retired. Phone, email, and text stay on this agent.";
}

export function liveVideoAddonPitch(): string {
  return "Live talking-head video is retired. Identity badges stay on every agent. Phone, email, and text are unaffected.";
}

export function liveVideoMeteringNote(): string {
  return "Existing Live Video subscriptions no longer mint sessions. Cancel unused add-ons from billing.";
}

export function presenterCustomizationMessage(presenter: AgentVideoPresenterConfig): string | null {
  if (presenter.chosenAvatarId) return "Saved identity pick";
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
