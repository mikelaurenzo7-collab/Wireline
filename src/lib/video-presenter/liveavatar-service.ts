/**
 * Live talking-head video is retired.
 *
 * Wireline no longer mints LiveAvatar / HeyGen sessions. The in-app identity
 * badge remains the live visual. Video files and clip-script substitutes are
 * not offered.
 *
 * This module keeps a fail-closed status helper and the synthetic defaults
 * used when creating business agents. It must not call api.liveavatar.com or
 * api.heygen.com.
 */
export function getLiveAvatarStatus() {
  return {
    configured: false,
    avatarCatalogReady: false,
    sandbox: false,
    defaultAvatarId: null as string | null,
    allowedMode: "lite" as const,
    engines: [] as const,
    retired: true as const,
  };
}

export function getDefaultLiveAvatarId(): string | null {
  return null;
}

export function businessAgentVideoPresenterDefaults(): {
  videoPresenterProvider: string;
  videoPresenterAvatarId: string | null;
  videoPresenterConsentStatus: string;
} {
  return {
    videoPresenterProvider: "synthetic",
    videoPresenterAvatarId: null,
    videoPresenterConsentStatus: "not_started",
  };
}

export function resetLiveAvatarCatalogCacheForTests(): void {
  // Catalog fetches are retired. Kept so older tests can import the helper.
}
