/**
 * Canva Connect APIs for marketing creative handoff from Wireline Design.
 */
import { fetchWithTimeout } from "./server-context";
import {
  loadDesignIntegration,
  updateDesignIntegrationTokens,
  type DesignIntegrationProvider,
} from "./design-integrations";
import { generateFigmaPkcePair } from "./figma-service";

const CANVA_PROVIDER: DesignIntegrationProvider = "canva";

export const CANVA_OAUTH_SCOPES = [
  "design:content:write",
  "design:meta:read",
  "asset:write",
  "asset:read",
].join(" ");

export function canvaOAuthConfigured(): boolean {
  return Boolean(process.env.CANVA_CLIENT_ID?.trim() && process.env.CANVA_CLIENT_SECRET?.trim());
}

export function getCanvaAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: CANVA_OAUTH_SCOPES,
    response_type: "code",
    client_id: process.env.CANVA_CLIENT_ID!,
    state,
    redirect_uri: redirectUri,
  });
  return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
}

export async function exchangeCanvaCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const credentials = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`,
  ).toString("base64");

  const r = await fetchWithTimeout(
    "https://api.canva.com/rest/v1/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    },
    25_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.error || data.message || "Canva token exchange failed"));
  }

  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function refreshCanvaToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const credentials = Buffer.from(
    `${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`,
  ).toString("base64");

  const r = await fetchWithTimeout(
    "https://api.canva.com/rest/v1/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    },
    25_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.error || data.message || "Canva token refresh failed"));
  }

  return data as { access_token: string; refresh_token: string; expires_in: number };
}

export async function getCanvaAccessToken(userId: string): Promise<string | null> {
  const conn = await loadDesignIntegration(userId, CANVA_PROVIDER);
  if (!conn) return null;

  const expiresAtMs = conn.expiresAt ? conn.expiresAt.getTime() : 0;
  if (expiresAtMs && Date.now() < expiresAtMs - 60_000) {
    return conn.accessToken;
  }

  if (!conn.refreshToken) return conn.accessToken;

  const refreshed = await refreshCanvaToken(conn.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await updateDesignIntegrationTokens(userId, CANVA_PROVIDER, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt,
  });
  return refreshed.access_token;
}

/** Re-export PKCE helper for Canva routes. */
export { generateFigmaPkcePair as generateCanvaPkcePair };

export interface CanvaImportResult {
  designId?: string;
  editUrl?: string;
  jobId?: string;
}

/**
 * Import a PNG/PDF asset into Canva via design import job API.
 * Returns an edit URL when the job completes synchronously or a job id to poll.
 */
export async function importAssetToCanva(
  userId: string,
  input: { fileName: string; mimeType: string; data: Buffer; title: string },
): Promise<CanvaImportResult> {
  const token = await getCanvaAccessToken(userId);
  if (!token) throw new Error("Canva is not connected. Connect Canva for marketing handoff.");

  const base64 = input.data.toString("base64");
  const importType = input.mimeType.includes("pdf") ? "pdf" : "png";

  const r = await fetchWithTimeout(
    "https://api.canva.com/rest/v1/imports",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title.slice(0, 120),
        import_type: importType,
        file: { name: input.fileName, content_base64: base64 },
      }),
    },
    60_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(String(data.message || data.error || "Canva import failed"));
  }

  const job = data.job as { id?: string; status?: string } | undefined;
  const design = data.design as { id?: string; urls?: { edit_url?: string } } | undefined;

  return {
    jobId: job?.id,
    designId: design?.id,
    editUrl: design?.urls?.edit_url,
  };
}
