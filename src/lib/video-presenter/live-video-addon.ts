/**
 * Live video presence is an optional add-on — not part of core agent launch.
 * Wireline face (synthetic) is the default for every agent until a customer opts in.
 *
 * Server-only module: `getLiveAvatarStatus` pulls the provider service and the
 * server context. Browser code must import provider membership from
 * `./live-video-providers` instead; the helpers are re-exported here so route
 * callers keep one import site.
 */
import { getLiveAvatarStatus } from "./liveavatar-service";

export { agentLiveVideoOptedIn, isLiveVideoProvider } from "./live-video-providers";

/** Platform can render live video when API keys exist (Wireline ops). */
export function isLiveVideoPlatformAvailable(): boolean {
  return getLiveAvatarStatus().configured;
}

/** @deprecated Prefer `addon` from GET /api/agents/:id/video-presenter — includes billing entitlement. */
export function isLiveVideoAddonOffered(): boolean {
  return isLiveVideoPlatformAvailable();
}
