/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { tcpaRateLimit } from "../middleware/api-rate-limits";
import {
  evaluateOutboundConsent,
  getConsentRuleForPhone,
  CONSENT_RULE_VERSION,
} from "../lib/tcpa-consent";
import { normalizeDncPhone } from "../lib/compliance";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// ==========================================
// DNC (DO NOT CALL) LIST — Compliance
// ==========================================

interface DncEntry {
  phone: string;
  reason?: string;
  source?: string;
}

// List DNC entries
router.get("/dnc", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await drizzle
      .select({
        id: schema.dncList.id,
        phone: schema.dncList.phone,
        phoneRaw: schema.dncList.phoneRaw,
        reason: schema.dncList.reason,
        source: schema.dncList.source,
        createdAt: schema.dncList.createdAt,
      })
      .from(schema.dncList)
      .where(eq(schema.dncList.userId, req.user.id))
      .orderBy(desc(schema.dncList.createdAt));

    // SPA reads snake_case (entry.phone_raw, entry.created_at). Normalize
    // at the boundary so the formatted phone shows instead of bare e164.
    const entries = (data || []).map((r) => ({
      id: r.id,
      phone: r.phone,
      phone_raw: r.phoneRaw,
      reason: r.reason,
      source: r.source,
      created_at: r.createdAt,
    }));

    res.json({ entries });
  } catch (e: any) {
    log.error("DNC list fetch failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch DNC list." });
  }
});

// Add one or more numbers to DNC list
router.post("/dnc", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body as { entries: Array<DncEntry> };
    if (!entries || entries.length === 0) {
      return res.status(400).json({ error: "entries array is required." });
    }
    const rows = entries
      .filter((e: DncEntry) => e.phone)
      .map((e: DncEntry) => ({
        userId: req.user.id,
        phone: normalizeDncPhone(e.phone),
        phoneRaw: e.phone,
        reason: e.reason || null,
        source: e.source || "manual",
      }))
      .filter((r: any) => r.phone.length > 0);

    if (rows.length === 0)
      return res.status(400).json({ error: "No valid phone numbers provided." });

    const data = await drizzle
      .insert(schema.dncList)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: schema.dncList.id });

    const added = data?.length ?? 0;
    if (added > 0) {
      void auditLogger
        .logDnc("added", {
          userId: req.user.id,
          count: added,
          source: entries[0]?.source || "manual",
          ip: req.ip,
          metadata: { requested: rows.length },
        })
        .catch((err) => log.warn("audit logDnc(added) failed", { error: getErrorMessage(err) }));

      // Mid-call compliance enforcement: terminate active calls for newly suppressed numbers
      const { SentinelService } = await import("../services/sentinel");
      const sentinel = new SentinelService();
      for (const row of rows) {
        void sentinel.terminateActiveCallsForNumber(row.phone).catch((err) =>
          log.error("sentinel terminate-on-DNC failed", {
            phone: row.phone,
            error: getErrorMessage(err),
          }),
        );
      }
    }
    res.json({ success: true, added });
  } catch (e: any) {
    log.error("DNC add failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to add to DNC list." });
  }
});

// Remove a number from DNC list
router.delete("/dnc/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await drizzle
      .delete(schema.dncList)
      .where(and(eq(schema.dncList.id, req.params.id), eq(schema.dncList.userId, req.user.id)));

    void auditLogger
      .logDnc("removed", {
        userId: req.user.id,
        count: 1,
        ip: req.ip,
        metadata: { dnc_id: req.params.id },
      })
      .catch((err) => log.warn("audit logDnc(removed) failed", { error: getErrorMessage(err) }));
    res.json({ success: true });
  } catch (e: any) {
    log.error("DNC delete failed", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to remove DNC entry." });
  }
});

// ==========================================
// TCPA CONSENT CHECK
// ==========================================

/**
 * GET /api/tcpa/consent-check?phone=+14155551234&is_marketing=true
 * Returns the TCPA consent gate decision before an outbound call is placed.
 * Internally checks wireline_dnc for the calling user's DNC list.
 */
router.get(
  "/tcpa/consent-check",
  authenticateUser,
  tcpaRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const phone = String(req.query.phone || "").trim();
      if (!phone) return res.status(400).json({ error: "phone query param required" });

      const isMarketing = req.query.is_marketing !== "false";

      const [dncRows, settingRows] = await Promise.all([
        drizzle
          .select({ id: schema.dncList.id })
          .from(schema.dncList)
          .where(
            and(
              eq(schema.dncList.userId, req.user.id),
              eq(schema.dncList.phone, normalizeDncPhone(phone)),
            ),
          )
          .limit(1),
        drizzle
          .select({ businessName: schema.settings.businessName })
          .from(schema.settings)
          .where(eq(schema.settings.userId, req.user.id))
          .limit(1),
      ]);

      const { rule, state } = getConsentRuleForPhone(phone);
      const decision = evaluateOutboundConsent({
        phone,
        is_internal_dnc: dncRows.length > 0,
        is_marketing_call: isMarketing,
        has_express_written_consent: !isMarketing,
        business_name: settingRows[0]?.businessName || undefined,
      });

      res.json({
        ...decision,
        inferred_state: state,
        rule,
        consent_rule_version: CONSENT_RULE_VERSION,
      });
    } catch (err: any) {
      log.error("GET /api/tcpa/consent-check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: "Consent check failed" });
    }
  },
);

export default router;
