/**
 * Figma REST API + OAuth for Wireline Design brand import and export handoff.
 */
import { createHash, randomBytes } from "node:crypto";
import { fetchWithTimeout } from "./server-context";
import {
  loadDesignIntegration,
  updateDesignIntegrationTokens,
  type DesignIntegrationProvider,
} from "./design-integrations";

const FIGMA_PROVIDER: DesignIntegrationProvider = "figma";

/**
 * OAuth scopes requested at connect time — must be a subset of scopes enabled on the
 * Wireline Design app in Figma Developers (OAuth scopes tab).
 *
 * API usage:
 * - current_user:read → GET /v1/me (connected account label)
 * - file_content:read → GET /v1/files/:key (brand import from file)
 * - file_metadata:read → file name/metadata on the same read path
 *
 * Enabled on the app but unused by Wireline v1: file_comments:*, file_versions:read,
 * library_* , file_dev_resources:*, project_metadata:read, webhooks:*.
 * Not enabled (Enterprise/org): file_variables:*, library_analytics:read, file_code_connect:write.
 */
export const FIGMA_OAUTH_SCOPES = [
  "current_user:read",
  "file_content:read",
  "file_metadata:read",
].join(",");

export function figmaOAuthConfigured(): boolean {
  return Boolean(process.env.FIGMA_CLIENT_ID?.trim() && process.env.FIGMA_CLIENT_SECRET?.trim());
}

export function generateFigmaPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function getFigmaAuthUrl(
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  const params = new URLSearchParams({
    client_id: process.env.FIGMA_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: FIGMA_OAUTH_SCOPES,
    state,
    response_type: "code",
  });
  if (codeChallenge) {
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `https://www.figma.com/oauth?${params.toString()}`;
}

export async function exchangeFigmaCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id_string?: string;
}> {
  const body = new URLSearchParams({
    redirect_uri: redirectUri,
    code,
    grant_type: "authorization_code",
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const credentials = Buffer.from(
    `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`,
  ).toString("base64");

  const r = await fetchWithTimeout(
    "https://api.figma.com/v1/oauth/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: body.toString(),
    },
    25_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.message || data.error || "Figma token exchange failed"));
  }

  return data as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user_id_string?: string;
  };
}

export async function refreshFigmaToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const credentials = Buffer.from(
    `${process.env.FIGMA_CLIENT_ID}:${process.env.FIGMA_CLIENT_SECRET}`,
  ).toString("base64");

  const r = await fetchWithTimeout(
    "https://api.figma.com/v1/oauth/refresh",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({ refresh_token: refreshToken }).toString(),
    },
    25_000,
  );

  const data = (await r.json()) as Record<string, unknown>;
  if (!r.ok || typeof data.access_token !== "string") {
    throw new Error(String(data.message || data.error || "Figma token refresh failed"));
  }

  return data as { access_token: string; expires_in: number };
}

export async function getFigmaAccessToken(userId: string): Promise<string | null> {
  const conn = await loadDesignIntegration(userId, FIGMA_PROVIDER);
  if (!conn) return null;

  const expiresAtMs = conn.expiresAt ? conn.expiresAt.getTime() : 0;
  if (expiresAtMs && Date.now() < expiresAtMs - 60_000) {
    return conn.accessToken;
  }

  if (!conn.refreshToken) return conn.accessToken;

  const refreshed = await refreshFigmaToken(conn.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await updateDesignIntegrationTokens(userId, FIGMA_PROVIDER, {
    accessToken: refreshed.access_token,
    expiresAt,
  });
  return refreshed.access_token;
}

export function parseFigmaFileKey(input: string): string | null {
  const trimmed = input.trim();
  const match =
    trimmed.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/) ||
    trimmed.match(/^([a-zA-Z0-9]{10,})$/);
  return match?.[1] ?? null;
}

export interface FigmaBrandTokens {
  colors: string[];
  typography: string[];
  components: string[];
  fileName?: string;
}

export async function fetchFigmaBrandTokens(
  userId: string,
  fileKey: string,
): Promise<FigmaBrandTokens> {
  const token = await getFigmaAccessToken(userId);
  if (!token) throw new Error("Figma is not connected. Connect Figma in Wireline Design first.");

  const fileRes = await fetchWithTimeout(
    `https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}?depth=1`,
    { headers: { Authorization: `Bearer ${token}` } },
    30_000,
  );
  const fileData = (await fileRes.json()) as Record<string, unknown>;
  if (!fileRes.ok) {
    throw new Error(String(fileData.err || fileData.message || "Failed to read Figma file"));
  }

  const colors = new Set<string>();
  const typography = new Set<string>();
  const components: string[] = [];

  const styles = fileData.styles as
    | Record<string, { name?: string; styleType?: string }>
    | undefined;
  if (styles) {
    for (const style of Object.values(styles)) {
      if (style.styleType === "FILL" && style.name) colors.add(style.name);
      if (style.styleType === "TEXT" && style.name) typography.add(style.name);
    }
  }

  const componentMeta = fileData.components as Record<string, { name?: string }> | undefined;
  if (componentMeta) {
    for (const comp of Object.values(componentMeta)) {
      if (comp.name) components.push(comp.name);
    }
  }

  return {
    colors: [...colors].slice(0, 48),
    typography: [...typography].slice(0, 24),
    components: components.slice(0, 48),
    fileName: typeof fileData.name === "string" ? fileData.name : undefined,
  };
}

export async function fetchFigmaMe(userId: string): Promise<{ email: string; handle: string }> {
  const token = await getFigmaAccessToken(userId);
  if (!token) throw new Error("Figma not connected");

  const r = await fetchWithTimeout("https://api.figma.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await r.json()) as { email?: string; handle?: string };
  if (!r.ok) throw new Error("Failed to fetch Figma user");
  return { email: data.email ?? "", handle: data.handle ?? "" };
}
