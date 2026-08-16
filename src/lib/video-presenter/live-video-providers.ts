/**
 * Client-safe live-video provider membership.
 *
 * This module is imported by browser bundles (Studio pages) and by server
 * routes. It must stay pure: no server-context, provider-service, database,
 * or node: imports. Server-only availability checks live in
 * `live-video-addon.ts`, which re-exports these helpers for route callers.
 */
import type { VideoPresenterProviderId } from "../agent-identity";

const LIVE_VIDEO_PROVIDERS = new Set<VideoPresenterProviderId>([
  "liveavatar",
  "heygen",
  "tavus",
  "d-id",
  "simli",
]);

export function isLiveVideoProvider(
  provider: string | null | undefined,
): provider is VideoPresenterProviderId {
  return LIVE_VIDEO_PROVIDERS.has(provider as VideoPresenterProviderId);
}

export function agentLiveVideoOptedIn(agent: {
  videoPresenterProvider?: string | null;
  video_presenter_provider?: string | null;
}): boolean {
  const provider = agent.videoPresenterProvider ?? agent.video_presenter_provider ?? null;
  return isLiveVideoProvider(provider);
}
