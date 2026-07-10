import type { AgentVideoPresenterConfig, VideoPresenterConsentStatus } from "./types";

/** Customer-facing copy never exposes the underlying video provider. */
export function videoPresenterStatusMessage(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
  isBusinessAgent: boolean,
): string {
  if (!isBusinessAgent) {
    return "Personal agents keep a private Wireline face. Live on-screen video stays off by default.";
  }
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) {
      return "Catalog face saved. Add live video when you want it on calls and your site — the built-in face stays as fallback.";
    }
    return "Use the built-in face now. Pick a catalog presenter below, then add live video when you want photoreal streaming.";
  }
  if (!platformConfigured) return "Live video add-on is not available on this workspace yet.";
  if (presenter.avatarSource === "agent" && presenter.status === "ready") {
    return "Live video add-on is on for this agent. The Wireline face remains the always-on fallback.";
  }
  if (presenter.status === "ready" && presenter.avatarSource === "workspace_default") {
    return "Live video is on using your workspace default presenter. Pick a catalog face to customize this agent.";
  }
  if (presenter.status === "ready") {
    return "Live video add-on is active. The Wireline face remains the always-on fallback.";
  }
  if (presenter.consentStatus === "pending") {
    return "Custom presenter approval is in review. The Wireline face covers every surface until it clears.";
  }
  if (presenter.consentStatus === "rejected") {
    return "Custom presenter was not approved. Pick a catalog face or contact support.";
  }
  if (!presenter.chosenAvatarId && !presenter.avatarId) {
    return "Choose a catalog presenter below — no voice agent setup required, only a visual face.";
  }
  return "Finish presenter setup below.";
}

export function videoPresenterPreviewHint(
  presenter: AgentVideoPresenterConfig,
  platformConfigured: boolean,
): string {
  if (presenter.status === "disabled" || presenter.provider === "synthetic") {
    if (presenter.chosenAvatarId) return "Face is saved. Enable live video to preview the stream here.";
    return "Pick a catalog face below, then enable live video to preview streaming.";
  }
  if (presenter.status === "ready" && platformConfigured) {
    if (presenter.avatarSource === "workspace_default") {
      return "Preview uses your workspace default until you pick a face for this agent.";
    }
    return "Preview the live stream, then hear your agent voice drive lip-sync on video.";
  }
  if (!platformConfigured) {
    return "Live video preview unlocks when the add-on is enabled on your workspace.";
  }
  return "Select a catalog presenter face to enable preview.";
}

export function liveVideoAddonPitch(): string {
  return "Photoreal on-screen presenter for your website and video slot — billed as an add-on. Your agent voice stays on Wireline; this is visual only. Selecting Add live video confirms that you chose this catalog presenter and authorize Wireline to render it for this agent.";
}

/** Shown on the live-video add-on card — sets metering expectations without vendor jargon. */
export function liveVideoMeteringNote(): string {
  return "~1 credit per minute while the live presenter preview is connected.";
}

export function presenterCustomizationMessage(presenter: AgentVideoPresenterConfig): string | null {
  if (presenter.chosenAvatarId) return "Custom for this agent";
  if (presenter.avatarSource === "workspace_default") {
    return "Workspace default — pick a catalog face to make this agent yours.";
  }
  return null;
}

export function consentLabel(status: VideoPresenterConsentStatus): string {
  switch (status) {
    case "approved":
      return "Face saved";
    case "pending":
      return "Review pending";
    case "rejected":
      return "Not approved";
    default:
      return "Catalog face";
  }
}
