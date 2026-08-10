/**
 * Video presenter types — provider-agnostic contract for on-screen agents.
 */
import type { VideoPresenterProviderId } from "../agent-identity";

export type VideoPresenterConsentStatus = "not_started" | "pending" | "approved" | "rejected";

export type VideoPresenterRuntimeStatus = "not_configured" | "ready" | "disabled" | "error";

export type VideoPresenterAvatarSource = "agent" | "workspace_default" | "none";

export type AgentVideoPresenterConfig = {
  provider: VideoPresenterProviderId | null;
  /** Explicit per-agent catalog pick — included identity, independent of live video add-on. */
  chosenAvatarId: string | null;
  /** Runtime LiveAvatar id when live video is on (agent pick or workspace default). */
  avatarId: string | null;
  /** Whether the active live avatar came from this agent row or the workspace env default. */
  avatarSource: VideoPresenterAvatarSource;
  consentStatus: VideoPresenterConsentStatus;
  status: VideoPresenterRuntimeStatus;
  headline: string;
  description: string;
  /** Whether LIVEAVATAR_API_KEY is set on the workspace. */
  platformConfigured?: boolean;
};

export type LiveAvatarSessionCredentials = {
  provider: "liveavatar";
  /** Minted server-side; client passes to @heygen/liveavatar-web-sdk */
  sessionToken: string;
  sessionId?: string;
  livekitUrl?: string;
  livekitClientToken?: string;
  wsUrl?: string | null;
  sandbox: boolean;
  /** Product/provider ceiling for this session. */
  maxSessionSeconds?: number;
};

export type LiveVideoAddonState = {
  platformConfigured: boolean;
  addonOffered: boolean;
  billingEntitled: boolean;
  liveVideoAddonEnabled: boolean;
  liveVideoCheckoutAvailable?: boolean;
  planId: string | null;
  upgradeRequired: boolean;
  reason: string | null;
};

export type VideoPresenterSessionResponse = {
  configured: boolean;
  fallbackSeed: string;
  presenter: AgentVideoPresenterConfig;
  live?: LiveAvatarSessionCredentials;
  error?: string;
  code?: string;
};
