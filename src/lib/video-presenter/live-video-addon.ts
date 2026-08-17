/**
 * Live video presence is retired. Identity badges are the live visual.
 * Work companions draft clip scripts. Imagine file generation is not offered.
 *
 * Server-only module. Browser code must import provider membership from
 * `./live-video-providers` instead.
 */
import { getLiveAvatarStatus } from "./liveavatar-service";

export { agentLiveVideoOptedIn, isLiveVideoProvider } from "./live-video-providers";

export function isLiveVideoPlatformAvailable(): boolean {
  return getLiveAvatarStatus().configured;
}

/** Checkout must not sell a retired talking-head product. */
export function isLiveVideoAddonOffered(): boolean {
  return false;
}
