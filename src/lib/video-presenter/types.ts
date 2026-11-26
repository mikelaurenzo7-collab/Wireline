/**
 * Video presenter types. Live talking-head video is retired; these describe the
 * identity-badge presenter config that agent and mobile routes still return.
 */
import type { VideoPresenterProviderId } from "../agent-identity";

export type VideoPresenterConsentStatus = "not_started" | "pending" | "approved" | "rejected";

export type VideoPresenterRuntimeStatus = "not_configured" | "ready" | "disabled" | "error";

export type VideoPresenterAvatarSource = "agent" | "workspace_default" | "none";

export type AgentVideoPresenterConfig = {
  provider: VideoPresenterProviderId | null;
  /** Explicit per-agent catalog pick, kept as the Bot's saved identity. */
  chosenAvatarId: string | null;
  /** Always null now that no live avatar session can start. */
  avatarId: string | null;
  /** Whether the saved identity came from this agent row. */
  avatarSource: VideoPresenterAvatarSource;
  consentStatus: VideoPresenterConsentStatus;
  status: VideoPresenterRuntimeStatus;
  headline: string;
  description: string;
  /** Always false: the retired provider is never configured. */
  platformConfigured?: boolean;
};
