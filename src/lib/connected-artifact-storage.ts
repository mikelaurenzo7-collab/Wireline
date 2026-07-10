import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { decryptSecret, encryptSecret } from "./secret-vault";
import { drizzle, fetchWithTimeout, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type ConnectedArtifactDestination = "google_drive" | "onedrive";

export interface ConnectedArtifactUpload {
  provider: ConnectedArtifactDestination;
  externalId: string;
  externalUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

type ProviderConnection = {
  id: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

async function connectionFor(
  userId: string,
  provider: "google_sheets" | "microsoft_excel",
): Promise<ProviderConnection | null> {
  const [row] = await drizzle
    .select({
      id: schema.crmConnections.id,
      provider: schema.crmConnections.provider,
      accessToken: schema.crmConnections.accessToken,
      refreshToken: schema.crmConnections.refreshToken,
      expiresAt: schema.crmConnections.expiresAt,
    })
    .from(schema.crmConnections)
    .where(
      and(eq(schema.crmConnections.userId, userId), eq(schema.crmConnections.provider, provider)),
    )
    .limit(1);
  return row || null;
}

async function refreshGoogle(
  connection: ProviderConnection,
  refreshToken: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    },
    15_000,
  );
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Google token refresh failed");
  }
  await drizzle
    .update(schema.crmConnections)
    .set({
      accessToken: encryptSecret(data.access_token),
      ...(data.refresh_token ? { refreshToken: encryptSecret(data.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.crmConnections.id, connection.id));
  return data.access_token;
}

async function refreshMicrosoft(
  connection: ProviderConnection,
  refreshToken: string,
): Promise<string> {
  const response = await fetchWithTimeout(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    },
    15_000,
  );
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || "Microsoft token refresh failed");
  }
  await drizzle
    .update(schema.crmConnections)
    .set({
      accessToken: encryptSecret(data.access_token),
      refreshToken: data.refresh_token
        ? encryptSecret(data.refresh_token)
        : connection.refreshToken,
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
      updatedAt: new Date(),
    })
    .where(eq(schema.crmConnections.id, connection.id));
  return data.access_token;
}

async function accessTokenFor(
  userId: string,
  provider: "google_sheets" | "microsoft_excel",
): Promise<string | null> {
  const connection = await connectionFor(userId, provider);
  if (!connection) return null;

  let token = decryptSecret(connection.accessToken);
  const refreshToken = connection.refreshToken ? decryptSecret(connection.refreshToken) : null;
  const expiringSoon =
    !connection.expiresAt || connection.expiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (expiringSoon && refreshToken) {
    token =
      provider === "google_sheets"
        ? await refreshGoogle(connection, refreshToken)
        : await refreshMicrosoft(connection, refreshToken);
  }
  return token;
}

function safeFileName(value: string): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex -- strips filesystem-illegal and control characters for a cross-platform-safe filename.
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || `Wireline Report ${Date.now()}`).slice(0, 180);
}

async function uploadToGoogleDrive(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ConnectedArtifactUpload> {
  const token = await accessTokenFor(input.userId, "google_sheets");
  if (!token) throw new Error("Connect Google Sheets/Drive before exporting this artifact.");

  const fileName = safeFileName(input.fileName);
  const boundary = `wireline_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName })}\r\n`,
  );
  const fileHeader = Buffer.from(`--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`);
  const ending = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([metadata, fileHeader, Buffer.from(input.bytes), ending]);

  const response = await fetchWithTimeout(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.byteLength),
      },
      body: body as unknown as BodyInit,
    },
    30_000,
  );
  const data = (await response.json()) as {
    id?: string;
    webViewLink?: string;
    webContentLink?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || `Google Drive upload failed (${response.status})`);
  }
  return {
    provider: "google_drive",
    externalId: data.id,
    externalUrl:
      data.webViewLink || data.webContentLink || `https://drive.google.com/open?id=${data.id}`,
    fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
  };
}

async function uploadToOneDrive(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ConnectedArtifactUpload> {
  const token = await accessTokenFor(input.userId, "microsoft_excel");
  if (!token) throw new Error("Connect Microsoft Excel/OneDrive before exporting this artifact.");

  const fileName = safeFileName(input.fileName);
  const response = await fetchWithTimeout(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": input.mimeType,
      },
      body: Buffer.from(input.bytes) as unknown as BodyInit,
    },
    30_000,
  );
  const data = (await response.json()) as {
    id?: string;
    webUrl?: string;
    error?: { message?: string };
  };
  if (!response.ok || !data.id || !data.webUrl) {
    throw new Error(data.error?.message || `OneDrive upload failed (${response.status})`);
  }
  return {
    provider: "onedrive",
    externalId: data.id,
    externalUrl: data.webUrl,
    fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
  };
}

export async function uploadArtifactToConnectedStorage(input: {
  userId: string;
  destination: ConnectedArtifactDestination;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ConnectedArtifactUpload> {
  try {
    return input.destination === "google_drive"
      ? await uploadToGoogleDrive(input)
      : await uploadToOneDrive(input);
  } catch (error) {
    log.error("connected artifact upload failed", {
      userId: input.userId,
      destination: input.destination,
      fileName: input.fileName,
      error: getErrorMessage(error),
    });
    throw error;
  }
}
