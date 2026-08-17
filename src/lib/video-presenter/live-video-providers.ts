/**
 * Client-safe live-video provider membership.
 *
 * Live talking-head providers are retired. Historical agent rows may still
 * store liveavatar/heygen; they must not mint a session.
 */
import type { VideoPresenterProviderId } from "../agent-identity";

const LIVE_VIDEO_PROVIDERS = new Set<VideoPresenterProviderId>([]);

export function isLiveVideoProvider(
  provider: string | null | undefined,
): provider is VideoPresenterProviderId {
  return LIVE_VIDEO_PROVIDERS.has(provider as VideoPresenterProviderId);
}

export function agentLiveVideoOptedIn(_agent: {
  videoPresenterProvider?: string | null;
  video_presenter_provider?: string | null;
}): boolean {
  return false;
}
