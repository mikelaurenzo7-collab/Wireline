/**
 * Live video presence is an optional add-on — not part of core agent launch.
 * Wireline face (synthetic) is the default for every agent until a customer opts in.
 */
import type { VideoPresenterProviderId } from "../agent-identity";
import { getLiveAvatarStatus } from "./liveavatar-service";

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

/** Platform can render live video when API keys exist (Wireline ops). */
export function isLiveVideoPlatformAvailable(): boolean {
  return getLiveAvatarStatus().configured;
}

/** Customer-facing add-on is available when ops configured live video keys. */
export function isLiveVideoAddonOffered(): boolean {
  return isLiveVideoPlatformAvailable();
}
