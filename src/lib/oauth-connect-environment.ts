import { AppError } from "./api-error";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";

/** These OAuth integrations are no longer offered for new connections. */
const RETIRED_OAUTH_PROVIDERS = new Set([
  "salesforce",
  "hubspot",
  "slack",
  "x",
  "zoom",
  "apollo",
  "meta",
  "shopify",
  "square",
  "microsoft_teams",
  "microsoft_excel",
  "google sheets",
]);

/**
 * Gate creation or replacement of a tenant-owned provider OAuth grant.
 *
 * Sign-in OAuth is intentionally separate and remains available to every
 * account environment. Integration OAuth, however, can authorize live vendor
 * access and must therefore follow the same production-only boundary as every
 * other external action.
 */
export async function assertOAuthProviderConnectAllowed(
  userId: unknown,
  provider: string,
): Promise<string> {
  if (typeof userId !== "string" || !userId) {
    throw AppError.fromHttpStatus(401, "Unauthorized");
  }

  if (RETIRED_OAUTH_PROVIDERS.has(provider.trim().toLowerCase())) {
    throw new AppError(410, "CONNECTION_RETIRED", "This connection is no longer available.");
  }

  await assertLiveExternalActionAllowed(userId, `${provider} OAuth connect`);
  return userId;
}
