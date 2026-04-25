import type { Request } from "express";
import { google } from "googleapis";

import { env, getRequiredEnv } from "./env";

export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function getConfiguredBaseUrl(req: Request) {
  const configured = env.APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const host = req.get("host");
  if (!host) {
    throw new Error("Unable to determine application base URL.");
  }

  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  return `${protocol}://${host}`;
}

export function getGoogleOAuthClient(req: Request) {
  const baseUrl = getConfiguredBaseUrl(req);
  return new google.auth.OAuth2(
    getRequiredEnv("GOOGLE_CLIENT_ID"),
    getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    `${baseUrl}/api/oauth/google/callback`
  );
}

export { google };
