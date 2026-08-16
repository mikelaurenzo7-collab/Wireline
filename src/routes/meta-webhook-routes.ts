import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- vendor webhook payloads are JSON envelopes with provider-specific shapes. */
import express, { Request, Response } from "express";
import { createIpRateLimiter } from "../middleware/api-rate-limits";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { drizzle, log, tenantStore } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "../lib/secret-vault";
import { getErrorMessage } from "../lib/server-utils";
import { runInBackground } from "../lib/background-work";

// Targeted rate limit for Meta leadgen webhooks.
// Meta retries failed deliveries with exponential backoff.
// 60 requests per minute allows for legitimate retry bursts while
// preventing leadgen bombing or DNC list pollution attacks.
const metaRateLimiter = createIpRateLimiter({
  bucket: "webhook:meta",
  windowMs: 60_000,
  max: 60,
  message: { error: "Too many leadgen events. Please try again later." },
});

/**
 * Meta (Facebook) Lead Ads webhook.
 *
 * Two endpoints, both unauthenticated (Meta calls them directly):
 *
 *   GET  /api/webhooks/meta/leads — Meta's one-time subscription
 *        challenge. Echoes `hub.challenge` if `hub.verify_token`
 *        matches `META_VERIFY_TOKEN`. Without this Meta won't let
 *        you subscribe a page to leadgen events.
 *
 *   POST /api/webhooks/meta/leads — leadgen event delivery. Body
 *        is HMAC-signed with `META_APP_SECRET` over the raw body
 *        using SHA-256, header `X-Hub-Signature-256`. We verify
 *        signature with timing-safe compare, then process each
 *        leadgen change: look up the Wireline tenant that owns the
 *        page, fetch the full lead via Graph API using their
 *        access token, and insert into wireline_outbound_leads
 *        with source='meta'. The dialer picks them up on its next
 *        sweep.
 *
 * Idempotency: Meta retries failed deliveries. We use the Meta
 * `leadgen_id` as the lead's idempotency_key, so duplicate
 * deliveries upsert into the same row instead of creating dupes.
 */

const router = express.Router();
const META_GRAPH = "https://graph.facebook.com/v18.0";

// ────────────────────────────────────────────────────────────────────
//  GET — subscription verification handshake
// ────────────────────────────────────────────────────────────────────

router.get("/api/webhooks/meta/leads", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.META_VERIFY_TOKEN;

  if (!expected) {
    log.warn("Meta webhook verification: META_VERIFY_TOKEN not set");
    return res.status(503).send("Meta webhook is finishing setup");
  }
  if (mode === "subscribe" && token === expected && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }
  return res.status(403).send("Forbidden");
});

// ────────────────────────────────────────────────────────────────────
//  POST — leadgen event delivery
// ────────────────────────────────────────────────────────────────────

function verifyMetaSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !signature) return false;
  if (!Buffer.isBuffer(rawBody)) {
    // Defense in depth — if global express.json() ever runs first the
    // body is a parsed object and createHmac().update() would throw.
    // The body parser is centralized in src/lib/body-parsers.ts so
    // this should be unreachable in production, but we'd rather
    // fail-closed than crash the request.
    log.error("Meta signature: rawBody is not a Buffer", {
      bodyType: typeof rawBody,
    });
    return false;
  }
  // Header format: "sha256=<hex>"
  let expected: string;
  try {
    const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
    expected = `sha256=${expectedHex}`;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("Meta signature: HMAC compute failed", { error: getErrorMessage(err) });
    return false;
  }
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

/**
 * Find the Wireline tenant whose Meta connection has subscribed
 * to the given page_id. Page IDs are stored as a string array in
 * `crm_connections.metadata.page_ids` by the OAuth post-auth page
 * subscription step. Returns the tenant's userId + decrypted token,
 * or null if no tenant is subscribed to this page.
 */
async function resolveTenantForPage(
  pageId: string,
): Promise<{ userId: string; accessToken: string } | null> {
  try {
    const rows = await drizzle
      .select({
        userId: schema.crmConnections.userId,
        accessToken: schema.crmConnections.accessToken,
        metadata: schema.crmConnections.metadata,
      })
      .from(schema.crmConnections)
      .where(
        and(
          eq(schema.crmConnections.provider, "meta"),
          eq(schema.crmConnections.active, true),
          sql`(${schema.crmConnections.metadata}->'page_ids')::jsonb @> ${JSON.stringify([pageId])}::jsonb`,
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return { userId: row.userId, accessToken: decryptSecret(row.accessToken) };
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn("Meta tenant resolve failed", { pageId, error: getErrorMessage(err) });
    return null;
  }
}

interface MetaLeadField {
  name: string;
  values: string[];
}

async function fetchMetaLead(
  leadgenId: string,
  accessToken: string,
): Promise<{
  field_data: MetaLeadField[];
  created_time: string;
  ad_id?: string;
  form_id?: string;
} | null> {
  try {
    const r = await fetch(`${META_GRAPH}/${leadgenId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    return (await r.json()) as any;
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.warn("Meta Graph lead fetch failed", { leadgenId, error: getErrorMessage(err) });
    return null;
  }
}

function pickField(fields: MetaLeadField[], names: string[]): string | null {
  for (const n of names) {
    const f = fields.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (f && f.values?.[0]) return f.values[0];
  }
  return null;
}

router.post("/api/webhooks/meta/leads", metaRateLimiter, async (req: Request, res: Response) => {
  const sig = req.header("x-hub-signature-256");
  const rawBody = req.body as Buffer;

  if (!verifyMetaSignature(rawBody, sig)) {
    log.warn("Meta webhook signature mismatch");
    // Acknowledge with 200 so Meta doesn't retry an unverifiable
    // delivery, but log it as a security event.
    return res.status(200).send("OK");
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).send("Bad JSON");
  }

  // Always ack within 200ms — Meta retries on 5xx + timeout.
  res.status(200).send("OK");

  if (payload?.object !== "page" || !Array.isArray(payload.entry)) return;

  // Everything below outlives the response. On Vercel the instance freezes at
  // res.send, so inline post-ack work can be suspended and silently lost — an
  // acked Lead Ad that Meta will never redeliver. runInBackground pins the
  // instance via waitUntil and turns any escaped error (including AppError
  // from a DB checkout) into a logged failure instead of a write against the
  // already-finished response.
  runInBackground("meta webhook processing", () => processMetaPageEntries(payload.entry));
});

async function processMetaPageEntries(entries: any[]): Promise<void> {
  // Field router: each Page webhook field gets a dedicated processor.
  // We strategically handle the highest-value events (leadgen, messages,
  // ratings, feed, mention) and turn them into actionable AI agent tasks.
  // The rest get logged at debug level so we have a trail but don't
  // spam every Page profile update through to fleet_tasks.
  const HANDLED_FIELDS = new Set([
    "leadgen",
    "leadgen_update",
    "messages",
    "ratings",
    "feed",
    "mention",
  ]);

  for (const entry of entries) {
    const pageId = entry.id;
    if (!Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const field: string = change.field || "";
      const v = change.value || {};

      if (!HANDLED_FIELDS.has(field)) {
        // Logged but not processed — covers profile attribute updates,
        // Messenger-internal events, marketing message echoes etc.
        // We subscribe to everything to keep options open; the
        // processor stays surgical.
        continue;
      }

      // Resolve the tenant once per change — all handled fields need it.
      const tenant = await resolveTenantForPage(pageId);
      if (!tenant) {
        log.info("Meta event for unsubscribed page", { pageId, field });
        continue;
      }

      try {
        if (field === "leadgen" || field === "leadgen_update") {
          const leadgenId: string | undefined = v.leadgen_id;
          if (!leadgenId) continue;

          const detail = await fetchMetaLead(leadgenId, tenant.accessToken);
          if (!detail) continue;

          const fields = detail.field_data || [];
          const phone = pickField(fields, ["phone_number", "phone"]);
          const email = pickField(fields, ["email"]);
          const fullName =
            pickField(fields, ["full_name"]) ||
            [pickField(fields, ["first_name"]), pickField(fields, ["last_name"])]
              .filter(Boolean)
              .join(" ");

          if (!phone && !email) {
            log.info("Meta leadgen had no phone or email", { leadgenId });
            continue;
          }

          await tenantStore.run(tenant.userId, () =>
            drizzle
              .insert(schema.outboundLeads)
              .values({
                userId: tenant.userId,
                phoneNumber: null,
                customerNumber: phone,
                customerName: fullName || null,
                email: email || null,
                context: `Meta Lead Ad submission${v.form_id ? ` (form ${v.form_id})` : ""}`,
                status: "Queued",
                source: "meta",
                campaignSource: v.ad_id ? `ad:${v.ad_id}` : "meta_lead_ad",
                idempotencyKey: leadgenId,
                metadata: {
                  meta_leadgen_id: leadgenId,
                  page_id: pageId,
                  form_id: v.form_id,
                  ad_id: v.ad_id,
                  created_time: detail.created_time,
                  event_type: field,
                },
                receivedAt: new Date(),
              })
              .onConflictDoNothing(),
          );

          log.info("Meta lead ingested", {
            userId: tenant.userId,
            leadgenId,
            field,
            hasPhone: !!phone,
            hasEmail: !!email,
          });
          continue;
        }

        // Customer messaged the Page → route to Assistants tasks so the
        // CS agent can draft a response. We don't have a Messenger
        // OAuth flow yet (would need pages_messaging permission) but
        // logging the inbound is the right call so account holders see
        // something landed and we can wire reply later.
        if (field === "messages") {
          const msg = v.message || {};
          const senderId = v.sender?.id || "unknown";
          const text = msg.text || "(non-text message)";
          await tenantStore.run(tenant.userId, () =>
            drizzle.insert(schema.followUpTasks).values({
              userId: tenant.userId,
              taskType: "messenger_inbound",
              description: `Facebook message from ${senderId}: ${text.slice(0, 240)}`,
              priority: "medium",
              status: "pending",
              sourceType: "meta_webhook",
              sourceId: `${pageId}:${msg.mid || senderId}`,
              payload: { sender_id: senderId, message: msg, page_id: pageId },
              targetChannel: "manual",
            }),
          );
          log.info("Meta inbound message routed to Assistants tasks", {
            userId: tenant.userId,
            senderId,
          });
          continue;
        }

        // 1-3 star Page review → escalate. 4-5 star → just log.
        if (field === "ratings") {
          const rating = Number(v.rating || 0);
          const reviewerId = v.reviewer_id || "unknown";
          const reviewText = v.review_text || "";
          if (rating > 0 && rating <= 3) {
            await tenantStore.run(tenant.userId, () =>
              drizzle.insert(schema.followUpTasks).values({
                userId: tenant.userId,
                taskType: "review_escalation",
                description: `${rating}-star Facebook review from ${reviewerId}: ${reviewText.slice(0, 240)}`,
                priority: rating <= 2 ? "high" : "medium",
                status: "pending",
                sourceType: "meta_webhook",
                sourceId: `${pageId}:${reviewerId}`,
                payload: { rating, review_text: reviewText, page_id: pageId },
                targetChannel: "manual",
              }),
            );
          }
          log.info("Meta rating processed", {
            userId: tenant.userId,
            rating,
            escalated: rating > 0 && rating <= 3,
          });
          continue;
        }

        // Comment on a Page post or @mention. Quick log for the
        // Account Holder's awareness — full triage is a future feature.
        if (field === "feed" || field === "mention") {
          const item = v.item || field;
          const verb = v.verb || "update";
          log.info("Meta feed/mention event", {
            userId: tenant.userId,
            field,
            item,
            verb,
            from: v.from?.id,
          });
          continue;
        }
      } catch (err) {
        // Infra faults (AppError from a DB checkout) abort the batch — the
        // remaining changes would hit the same outage, and runInBackground
        // logs the abort. Anything else is a per-change failure worth its own
        // log line without sacrificing the rest of the delivery.
        if (err instanceof AppError) throw err;
        log.error("Meta webhook processing failed", {
          field,
          pageId,
          error: getErrorMessage(err),
        });
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────────
//  POST — Data Deletion Callback
//
//  Facebook POSTs here when a user removes Wireline from their
//  Facebook account ("Apps & Websites → Remove"). Spec:
//  https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
//
//  Request body:  signed_request=<base64-url(sig).base64-url(json)>
//  Response (JSON, MUST be 200):
//    { "url": "<status URL>", "confirmation_code": "<short code>" }
//
//  The user is shown the URL + code so they can come back and verify
//  the deletion completed. We use the confirmation_code as the
//  primary key for a deletion_requests table (future), but for v1
//  we generate a short random code, log the request, and mark any
//  matching meta crm_connections inactive so the integration stops
//  working immediately.
// ────────────────────────────────────────────────────────────────────

function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id?: string; algorithm?: string } | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;

  // base64url decode (replace -_ with +/ then base64 decode)
  const fromB64Url = (s: string): Buffer =>
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

  const sig = fromB64Url(encodedSig);
  const payloadJson = fromB64Url(encodedPayload).toString("utf8");

  // HMAC-SHA256 of the encoded payload (NOT the decoded JSON) using
  // app secret as the key. Facebook signs the base64url-encoded
  // string, so we hash that exact string.
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();

  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(sig, expected)) return null;

  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

router.post("/api/webhooks/meta/deletion", async (req: Request, res: Response) => {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    log.warn("Meta deletion callback: META_APP_SECRET not set");
    throw AppError.fromHttpStatus(503, "deletion service unavailable");
  }

  // Body is either application/x-www-form-urlencoded (signed_request=...)
  // or raw JSON if Facebook ever changes the format. Parse either —
  // both end up surfacing `signed_request` as the single field we need.
  const rawBody = (req.body as Buffer | undefined)?.toString("utf8") || "";
  let signedRequest = "";
  if (rawBody.startsWith("signed_request=")) {
    signedRequest = decodeURIComponent(rawBody.slice("signed_request=".length));
  } else {
    try {
      const parsed = JSON.parse(rawBody) as { signed_request?: string };
      signedRequest = parsed.signed_request || "";
    } catch {
      // Form-urlencoded with signed_request not at start — fall back
      // to manual split. URLSearchParams handles + → space, %xx decoding.
      const params = new URLSearchParams(rawBody);
      signedRequest = params.get("signed_request") || "";
    }
  }
  if (!signedRequest) {
    throw AppError.fromHttpStatus(400, "missing signed_request");
  }

  const payload = parseSignedRequest(signedRequest, appSecret);
  if (!payload || !payload.user_id) {
    log.warn("Meta deletion callback: invalid signed_request");
    throw AppError.fromHttpStatus(400, "invalid signed_request");
  }

  const facebookUserId = String(payload.user_id);
  // Short code shown to the end user. URL-safe alphabet, 10 chars
  // — collision risk is negligible at our scale and the code is
  // only meaningful when paired with the user's facebook_user_id
  // anyway.
  const confirmationCode =
    "WLN-" +
    Array.from({ length: 8 })
      .map(() => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[randomInt(31)])
      .join("");

  // Mark every Meta connection with this Facebook user_id as
  // inactive. We store the FB user_id in metadata.facebook_user_id
  // at OAuth time so this lookup is exact-match.
  try {
    const matching = await drizzle
      .select({
        id: schema.crmConnections.id,
        userId: schema.crmConnections.userId,
        metadata: schema.crmConnections.metadata,
      })
      .from(schema.crmConnections)
      .where(
        and(
          eq(schema.crmConnections.provider, "meta"),
          sql`(${schema.crmConnections.metadata}->>'facebook_user_id') = ${facebookUserId}`,
        ),
      );

    for (const row of matching || []) {
      await tenantStore.run(row.userId, () =>
        drizzle
          .update(schema.crmConnections)
          .set({
            active: false,
            metadata: {
              ...((row.metadata as Record<string, unknown>) || {}),
              deletion_requested_at: new Date().toISOString(),
              deletion_confirmation_code: confirmationCode,
            },
            updatedAt: new Date(),
          })
          .where(eq(schema.crmConnections.id, row.id)),
      );

      log.info("Meta deletion callback honored, connection deactivated", {
        userId: row.userId,
        facebookUserId,
        confirmationCode,
      });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("Meta deletion callback DB write failed", {
      facebookUserId,
      error: getErrorMessage(err),
    });
    // A 200 here is exactly what STOPS Facebook's retries — the connection
    // would stay active (token retained, leads still ingesting) while the
    // user holds a confirmation code implying deletion was accepted, and
    // nothing is persisted to retry later. 503 is the honest answer: Facebook
    // redelivers the callback and the deactivation gets another chance.
    throw AppError.fromHttpStatus(503, "deletion request could not be recorded, retry");
  }

  const baseUrl =
    (process.env.APP_URL && new URL(process.env.APP_URL).origin) || "https://trywireline.com";
  return res.status(200).json({
    url: `${baseUrl}/legal/data-deletion?fbid=${encodeURIComponent(facebookUserId)}&code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
});

export default router;
