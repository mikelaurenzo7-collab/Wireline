/**
 * Wireline adapter for @google/stitch-sdk — official Stitch MCP client + domain API.
 *
 * Dynamic-import the ESM-only SDK so the CJS server bundle can boot on Vercel
 * without resolving @google/stitch-sdk at require() time.
 */
import {
  getGoogleStitchApiKey,
  getGoogleApplicationCredentialsJson,
  getGoogleCloudProjectId,
  getGoogleStitchMcpBaseUrl,
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
  const credsJson = getGoogleApplicationCredentialsJson();
  const projectId = getGoogleCloudProjectId();

  let accessToken: string | undefined;

  if (credsJson && projectId) {
    try {
      const { GoogleAuth } = await import("google-auth-library");
      const auth = new GoogleAuth({
        credentials: JSON.parse(credsJson),
        scopes: "https://www.googleapis.com/auth/cloud-platform",
        projectId,
      });
      const authClient = await auth.getClient();
      const tokenResponse = await authClient.getAccessToken();
      if (tokenResponse?.token) {
        accessToken = tokenResponse.token;
      } else {
        throw new Error("No access token returned");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      throw new GoogleStitchError(
        `Failed to generate OAuth2 token from Service Account: ${errorMessage}`,
        "AUTH_FAILED"
      );
    }
  } else if (!apiKey) {
    throw new GoogleStitchError(
      "Neither GOOGLE_STITCH_API_KEY nor GOOGLE_APPLICATION_CREDENTIALS_JSON are configured",
      "AUTH_FAILED"
    );
  }

  const { Stitch, StitchToolClient } = await import("@google/stitch-sdk");
  
  const client = new StitchToolClient({
    baseUrl: getGoogleStitchMcpBaseUrl(),
    timeout: getGoogleStitchTimeoutMs(),
    ...(accessToken && projectId
      ? { accessToken, projectId }
      : { apiKey: apiKey || undefined }),
  });
  const stitch = new Stitch(client);

  return {
    stitch,
    client,
    close: () => client.close(),
  };
}
