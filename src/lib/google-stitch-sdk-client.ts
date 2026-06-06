/**
 * Wireline adapter for @google/stitch-sdk — official Stitch MCP client + domain API.
 */
import { Stitch, StitchToolClient } from "@google/stitch-sdk";
import {
  getGoogleStitchApiKey,
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

export interface GoogleStitchRuntime {
  stitch: Stitch;
  client: StitchToolClient;
  close: () => Promise<void>;
}

export function createGoogleStitchRuntime(): GoogleStitchRuntime {
  const apiKey = getGoogleStitchApiKey();
  if (!apiKey) {
    throw new GoogleStitchError("GOOGLE_STITCH_API_KEY is not configured", "AUTH_FAILED");
  }

  const client = new StitchToolClient({
    apiKey,
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
