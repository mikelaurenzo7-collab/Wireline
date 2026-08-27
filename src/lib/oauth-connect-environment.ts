import { AppError } from "./api-error";
import { assertLiveExternalActionAllowed } from "./account-environment-policy";

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

  await assertLiveExternalActionAllowed(userId, `${provider} OAuth connect`);
  return userId;
}
