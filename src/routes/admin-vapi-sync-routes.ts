/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * Owner-only endpoint that synchronizes Wireline knowledge + customer-
 * service playbook into the live Vapi assistants behind the 10
 * landing-page numbers.
 *
 * For each phone number in WIRELINE_CONTACT_AGENTS + WIRELINE_DEMO_AGENTS:
 *   1. Look up the Vapi assistant currently attached to that number.
 *   2. PATCH the assistant with:
 *        - new firstMessage (per-agent)
 *        - new system prompt: original role prompt + Wireline knowledge block
 *        - serverUrl pinned to https://trywireline.com/api/vapi-webhook
 *        - serverUrlSecret carried over from env
 *   3. PATCH the phone number itself to point serverUrl at trywireline.com
 *      (covers the case where the number has its own webhook override).
 *
 * Safe to re-run — last write wins and the operation is idempotent. The
 * endpoint returns a per-number report (skipped / patched / failed) so
 * the Account Holder can see exactly what changed.
 *
 * Auth: requesting user's email must match OWNER_EMAIL env var.
 */

import crypto from "node:crypto";
import { Router, Request, Response, NextFunction } from "express";
import { log } from "../lib/server-context";
import { AppError, asyncHandler } from "../lib/api-error";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { isPlatformAdmin } from "../middleware/platform-admin";
import type { AuthenticatedRequest } from "../types/auth";
import { listVapiNumbers } from "../lib/vapi-phone-numbers";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import { sanitizePhone } from "../lib/vapi-helpers";
import { VAPI_OPENAI_FALLBACK_MODEL } from "../lib/ai-models";
import {
  buildShowcaseAssistantPayload,
  buildShowcaseSystemPrompt,
  SHOWCASE_WEBHOOK_URL,
} from "../lib/showcase-assistant";

const router = Router();

const VAPI_BASE = "https://api.vapi.ai";

interface AgentSyncResult {
  agent: string;
  display: string;
  tel: string;
  assistantId?: string;
  status: "patched" | "skipped" | "failed";
  reason?: string;
}

async function vapiFetch(path: string, init?: RequestInit): Promise<any> {
  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) throw new Error("VAPI_PRIVATE_KEY not configured");
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await res.text();
  let parsed: any = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    /* leave parsed null */
  }
  if (!res.ok) {
    const msg = parsed?.message
      ? Array.isArray(parsed.message)
        ? parsed.message.join("; ")
        : parsed.message
      : body.slice(0, 200);
    throw new Error(`Vapi ${res.status}: ${msg}`);
  }
  return parsed;
}

async function patchAssistantWithOpenAiFallback(
  assistantId: string,
  assistantPayload: Record<string, any>,
) {
  try {
    await vapiFetch(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(assistantPayload),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (assistantPayload?.model?.provider !== "google") throw error;

    const fallbackPayload = {
      ...assistantPayload,
      model: {
        ...assistantPayload.model,
        provider: "openai",
        model: VAPI_OPENAI_FALLBACK_MODEL,
      },
    };
    delete fallbackPayload.model.fallbackModels;

    log.warn("Showcase sync fell back to OpenAI after Gemini patch failure", {
      assistantId,
      attemptedModel: assistantPayload?.model?.model,
      error: error instanceof Error ? error.message : String(error),
    });

    await vapiFetch(`/assistant/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(fallbackPayload),
    });
  }
}

async function syncOneAgent(
  agent: ContactAgent,
  kind: "cs" | "demo",
  numberLookup: Map<string, { id: string; assistantId?: string | null }>,
): Promise<AgentSyncResult> {
  const e164 = sanitizePhone(agent.tel) || agent.tel;
  const numEntry = numberLookup.get(e164);

  if (!numEntry) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      status: "skipped",
      reason: "no Vapi number matches this tel",
    };
  }
  if (!numEntry.assistantId) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      status: "skipped",
      reason: "Vapi number has no assistantId attached",
    };
  }

  try {
    // 1. PATCH the assistant — first message + system prompt + serverUrl.
    const systemPrompt = buildShowcaseSystemPrompt(agent, kind);

    // Vapi's system prompt cap is ~32k chars. Reject above 30k so we
    // never silent-fail a sync; the caller sees a clear error per agent
    // and the Account Holder knows to trim the knowledge file.
    const MAX_PROMPT_CHARS = 30_000;
    if (systemPrompt.length > MAX_PROMPT_CHARS) {
      return {
        agent: agent.name,
        display: agent.display,
        tel: agent.tel,
        assistantId: numEntry.assistantId,
        status: "failed",
        reason: `prompt ${systemPrompt.length} chars exceeds ${MAX_PROMPT_CHARS} cap — trim wireline-knowledge.ts`,
      };
    }
    const assistantPayload = buildShowcaseAssistantPayload(agent, kind, {
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    });
    await patchAssistantWithOpenAiFallback(numEntry.assistantId, assistantPayload);

    // 2. PATCH the phone number — server override pinned to trywireline.com.
    //    Some numbers have a number-level webhook override that beats the
    //    assistant's; setting it here keeps everything pointed at prod.
    const numberPayload: Record<string, any> = {
      server: { url: SHOWCASE_WEBHOOK_URL },
    };
    if (process.env.VAPI_WEBHOOK_SECRET) {
      numberPayload.server.secret = process.env.VAPI_WEBHOOK_SECRET;
    }
    await vapiFetch(`/phone-number/${numEntry.id}`, {
      method: "PATCH",
      body: JSON.stringify(numberPayload),
    });

    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      assistantId: numEntry.assistantId,
      status: "patched",
    };
  } catch (e: any) {
    return {
      agent: agent.name,
      display: agent.display,
      tel: agent.tel,
      assistantId: numEntry.assistantId ?? undefined,
      status: "failed",
      reason: e?.message || String(e),
    };
  }
}

// Permissive middleware — only runs authenticateUser when a Bearer
// token is present, so the X-Migration-Token path below works for
// ops/CI without an interactive session.
function syncOptionalAuth(req: Request, res: Response, next: NextFunction) {
  const hasBearer = (req.headers.authorization || "").startsWith("Bearer ");
  if (!hasBearer) return next();
  return (authenticateUser as any)(req, res, next);
}

router.post(
  "/api/admin/sync-vapi-knowledge",
  syncOptionalAuth,
  asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    // Authorize via platform-admin session (owner email or is_admin) OR
    // X-Migration-Token header (for ops/CI without a session).
    const provided = req.headers["x-migration-token"] as string | undefined;
    const expected = process.env.MIGRATION_TOKEN;
    const tokenOk = !!(
      provided &&
      expected &&
      provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    );

    let ownerOk = false;
    try {
      ownerOk = tokenOk ? false : await isPlatformAdmin(req.user);
    } catch (e: unknown) {
      log.error("[admin-vapi-sync] platform-admin check failed", {
        error: getErrorMessage(e),
      });
      throw AppError.internal("Authorization check failed");
    }

    if (!tokenOk && !ownerOk) {
      throw AppError.forbidden("Platform admin access required");
    }
    if (!process.env.VAPI_PRIVATE_KEY) {
      throw AppError.serviceUnavailable("VAPI_PRIVATE_KEY not configured");
    }

    try {
      // One Vapi number list → map e164 → { id, assistantId } for O(1) lookup.
      const numbers = await listVapiNumbers();
      const lookup = new Map<string, { id: string; assistantId?: string | null }>();
      for (const n of numbers) {
        if (n.number) lookup.set(n.number, { id: n.id, assistantId: n.assistantId });
      }

      const results: AgentSyncResult[] = [];
      for (const a of WIRELINE_CONTACT_AGENTS) {
        results.push(await syncOneAgent(a, "cs", lookup));
      }
      for (const a of WIRELINE_DEMO_AGENTS) {
        results.push(await syncOneAgent(a, "demo", lookup));
      }

      const counts = results.reduce(
        (acc, r) => {
          acc[r.status]++;
          return acc;
        },
        { patched: 0, skipped: 0, failed: 0 } as Record<string, number>,
      );

      log.info("Vapi knowledge sync completed", {
        userId: req.user?.id || "migration-token",
        counts,
      });

      return res.json({
        ok: true,
        webhookUrl: SHOWCASE_WEBHOOK_URL,
        counts,
        results,
      });
    } catch (e: any) {
      log.error("Vapi knowledge sync failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Sync failed");
    }
  }),
);

export default router;
