import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { drizzle, log, tenantStore } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { buildVapiAssistant } from "../vapi-assistant-factory-v2";
import {
  STUDIO_BROWSER_TEST_MAX_SECONDS,
  STUDIO_VAPI_WEB_PROXY_PATH,
  STUDIO_VAPI_WEB_TICKET_TTL_SECONDS,
  isStudioVapiWebConfigured,
} from "./studio-live-test-policy";

type StudioVapiWebTicketClaims = {
  v: 1;
  jti: string;
  iat: number;
  exp: number;
  userId: string;
  agentId: string;
};

export type StudioVapiWebTicketVerification =
  | { ok: true; claims: StudioVapiWebTicketClaims }
  | { ok: false; reason: "unavailable" | "malformed" | "invalid_signature" | "expired" };

function signingSecret(): string | null {
  const secret = process.env.INTERNAL_JWT_SECRET?.trim() || "";
  return secret.length >= 32 ? secret : null;
}

function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function studioVapiWebTicketingReady(): boolean {
  return Boolean(signingSecret()) && isStudioVapiWebConfigured();
}

export function issueStudioVapiWebTicket(input: {
  userId: string;
  agentId: string;
  nowMs?: number;
}): { token: string; claims: StudioVapiWebTicketClaims } {
  const secret = signingSecret();
  if (!secret) throw new Error("Studio live-test ticket signing is not configured.");

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const claims: StudioVapiWebTicketClaims = {
    v: 1,
    jti: randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + STUDIO_VAPI_WEB_TICKET_TTL_SECONDS,
    userId: input.userId,
    agentId: input.agentId,
  };
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  return { token: `${payload}.${signPayload(payload, secret)}`, claims };
}

export function verifyStudioVapiWebTicket(token: string): StudioVapiWebTicketVerification {
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "unavailable" };
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [payload, signature] = parts;
  if (!safeEqual(signPayload(payload, secret), signature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as StudioVapiWebTicketClaims;
    if (claims.v !== 1 || !claims.userId || !claims.agentId || !claims.jti) {
      return { ok: false, reason: "malformed" };
    }
    if (claims.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

export async function createStudioVapiWebSession(input: {
  userId: string;
  agentId: string;
}) {
  if (!studioVapiWebTicketingReady()) {
    throw AppError.fromHttpStatus(503, "The live phone test is temporarily unavailable.");
  }
  const [agent] = await drizzle
    .select({ id: schema.agents.id, name: schema.agents.name })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, input.agentId), eq(schema.agents.userId, input.userId)))
    .limit(1);
  if (!agent) throw AppError.fromHttpStatus(404, "That live test profile was not found.");

  const { token, claims } = issueStudioVapiWebTicket({
    userId: input.userId,
    agentId: input.agentId,
  });
  return {
    token,
    proxyUrl: STUDIO_VAPI_WEB_PROXY_PATH,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
    maxDurationSeconds: STUDIO_BROWSER_TEST_MAX_SECONDS,
    provider: "vapi",
    agentName: agent.name,
  };
}

export async function proxyStudioVapiWebCall(token: string): Promise<{
  status: number;
  contentType: string;
  body: string;
}> {
  const verification = verifyStudioVapiWebTicket(token);
  if (!verification.ok) {
    throw AppError.fromHttpStatus(401, "The live test ticket is invalid or expired.");
  }

  const privateKey = String(process.env.VAPI_PRIVATE_KEY || "").trim();
  if (!privateKey) {
    throw AppError.fromHttpStatus(503, "The live phone test is temporarily unavailable.");
  }

  return tenantStore.run(verification.claims.userId, async () => {
    const [agent] = await drizzle
      .select({ id: schema.agents.id })
      .from(schema.agents)
      .where(
        and(
          eq(schema.agents.id, verification.claims.agentId),
          eq(schema.agents.userId, verification.claims.userId),
        ),
      )
      .limit(1);
    if (!agent) throw AppError.fromHttpStatus(404, "That live test profile was not found.");

    const [userSettings] = await drizzle
      .select({
        subscriptionStatus: schema.settings.subscriptionStatus,
        aiTier: schema.settings.aiTier,
        voiceLlmProvider: schema.settings.voiceLlmProvider,
        voiceLlmModel: schema.settings.voiceLlmModel,
        twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
        twilioLookupEnabled: schema.settings.twilioLookupEnabled,
        businessName: schema.settings.businessName,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, verification.claims.userId))
      .limit(1);

    const assistant = await buildVapiAssistant({
      message: { type: "webCall" },
      agent: { id: verification.claims.agentId, user_id: verification.claims.userId },
      userSettings: userSettings || {},
      surface: "browser_test",
    });

    let upstream: globalThis.Response;
    try {
      upstream = await fetch("https://api.vapi.ai/call/web", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${privateKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assistant }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error: unknown) {
      log.error("studio vapi web proxy failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(502, "The live phone test could not start.");
    }

    return {
      status: upstream.status,
      contentType: upstream.headers.get("content-type") || "application/json",
      body: await upstream.text(),
    };
  });
}
