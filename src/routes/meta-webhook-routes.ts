import express, { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { decryptSecret } from "../lib/secret-vault";
import { getErrorMessage } from "../lib/server-utils";

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
  // Header format: "sha256=<hex>"
  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expected = `sha256=${expectedHex}`;
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
    const r = await fetch(
      `${META_GRAPH}/${leadgenId}?access_token=${encodeURIComponent(accessToken)}`,
    );
    if (!r.ok) return null;
    return (await r.json()) as any;
  } catch (err) {
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

router.post(
  "/api/webhooks/meta/leads",
  express.raw({ type: "*/*" }),
  async (req: Request, res: Response) => {
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

    for (const entry of payload.entry) {
      const pageId = entry.id;
      if (!Array.isArray(entry.changes)) continue;
      for (const change of entry.changes) {
        if (change.field !== "leadgen") continue;
        const v = change.value || {};
        const leadgenId: string | undefined = v.leadgen_id;
        if (!leadgenId) continue;

        try {
          const tenant = await resolveTenantForPage(pageId);
          if (!tenant) {
            log.info("Meta leadgen for unsubscribed page", { pageId, leadgenId });
            continue;
          }

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

          await drizzle
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
              },
              receivedAt: new Date(),
            })
            .onConflictDoNothing();

          log.info("Meta lead ingested", {
            userId: tenant.userId,
            leadgenId,
            hasPhone: !!phone,
            hasEmail: !!email,
          });
        } catch (err) {
          log.error("Meta leadgen processing failed", {
            leadgenId,
            pageId,
            error: getErrorMessage(err),
          });
        }
      }
    }
  },
);

export default router;
