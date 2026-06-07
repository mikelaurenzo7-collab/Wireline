/**
 * Wireline adapter for @google/stitch-sdk — official Stitch MCP client + domain API.
 *
 * Dynamic-import the ESM-only SDK so the CJS server bundle can boot on Vercel
 * without resolving @google/stitch-sdk at require() time.
 */
import {
  getGoogleStitchAccessToken,
  getGoogleStitchApiKey,
  getGoogleStitchMcpBaseUrl,
  getGoogleStitchQuotaProjectId,
  getGoogleStitchTimeoutMs,
} from "./google-stitch-config";
import { GoogleStitchError } from "./google-stitch-mcp-client";

export {
  mapStitchError,
  projectEntityToRef,
  screenEntityToRecord,
  withStitchAbort,
} from "./google-stitch-sdk-helpers";

type StitchSdkModule = typeof import("@google/stitch-sdk");

export interface GoogleStitchRuntime {
  stitch: InstanceType<StitchSdkModule["Stitch"]>;
  client: InstanceType<StitchSdkModule["StitchToolClient"]>;
  close: () => Promise<void>;
}

export async function createGoogleStitchRuntime(): Promise<GoogleStitchRuntime> {
  const apiKey = getGoogleStitchApiKey();
  const accessToken = getGoogleStitchAccessToken();
  const quotaProjectId = getGoogleStitchQuotaProjectId();
  if (!apiKey && !(accessToken && quotaProjectId)) {
    throw new GoogleStitchError(
      "Google Stitch credentials are not configured. Set GOOGLE_STITCH_API_KEY (preferred) or STITCH_ACCESS_TOKEN + GOOGLE_CLOUD_PROJECT.",
      "AUTH_FAILED",
    );
  }

  const { Stitch, StitchToolClient } = await import("@google/stitch-sdk");
  const client = new StitchToolClient({
    apiKey: apiKey ?? undefined,
    accessToken: apiKey ? undefined : (accessToken ?? undefined),
    projectId: apiKey ? undefined : (quotaProjectId ?? undefined),
    baseUrl: getGoogleStitchMcpBaseUrl(),
    timeout: getGoogleStitchTimeoutMs(),
  });
  const stitch = new Stitch(client);

  return {
    stitch,
    client,
    close: () => client.close(),
  };
}
