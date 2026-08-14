/**
 * Video presenter types — provider-agnostic contract for on-screen agents.
 */
import type { VideoPresenterProviderId } from "../agent-identity";
import type { LiveVideoMode, LiveVideoVoiceEngine } from "./live-video-session-policy";

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
  /** Minted server-side; client passes to @heygen/liveavatar-web-sdk. */
  sessionToken: string;
  sessionId?: string;
  livekitUrl?: string;
  livekitClientToken?: string;
  wsUrl?: string | null;
  sandbox: boolean;
  /** Hard provider/product ceiling; Studio may end the session sooner. */
  maxSessionSeconds?: number;
  /**
   * Resolved session mode. The client must only stream its own audio when the
   * session is LITE on the Wireline voice; in every other mode the provider
   * produces the speech and a second stream would talk over it.
   */
  mode?: LiveVideoMode;
  voiceEngine?: LiveVideoVoiceEngine;
  creditsPerMinute?: number;
  /**
   * Present when the requested engine could not be honored. The configuration
   * hint behind the degrade is server-logged, never sent to tenants.
   */
  degradedFrom?: LiveVideoVoiceEngine;
};

/**
 * Whether this session expects Wireline to push PCM into the lip-sync control.
 *
 * Treating an absent mode as "Wireline drives" keeps older clients and any
 * response that predates mode reporting on the path they already worked on.
 */
export function sessionExpectsWirelineAudio(
  credentials: Pick<LiveAvatarSessionCredentials, "mode" | "voiceEngine">,
): boolean {
  if (credentials.mode === "full") return false;
  return !credentials.voiceEngine || credentials.voiceEngine === "wireline_realtime";
}

export type LiveVideoAddonState = {
  platformConfigured: boolean;
  addonOffered: boolean;
  /** Authoritative paid-access decision after plan, Stripe, workspace flag, and provider checks. */
  billingEntitled: boolean;
  /** Webhook-maintained local cache; never use this alone as payment proof. */
  liveVideoAddonEnabled: boolean;
  liveVideoCheckoutAvailable?: boolean;
  /** Reserved monthly provider-session allowance shown before a session is minted. */
  liveVideoMinutesIncluded?: number;
  /** Minutes reserved atomically each time Studio opens a Live Video session. */
  liveVideoSessionMinutes?: number;
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
