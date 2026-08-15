/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { tcpaRateLimit } from "../middleware/api-rate-limits";
import {
  evaluateOutboundConsent,
  getConsentRuleForPhone,
  CONSENT_RULE_VERSION,
} from "../lib/tcpa-consent";
import {
  DNC_IMPORT_MAX_ENTRIES,
  DNC_LIST_MAX_ENTRIES,
  dncImportLimitError,
} from "../lib/dnc-import-limits";
import { normalizeDncPhone } from "../lib/compliance";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";
import { isFederalDncVendorConfigured } from "../lib/federal-dnc-service";
import { phoneSuffixForLog } from "../lib/twilio-webhook-privacy";

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
router.get("/api/dnc", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
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
      .orderBy(desc(schema.dncList.createdAt))
      .limit(DNC_LIST_MAX_ENTRIES);

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
    throw AppError.fromHttpStatus(500, "Failed to fetch DNC list.");
  }
});

// Add one or more numbers to DNC list
router.post("/api/dnc", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { entries } = req.body as { entries: Array<DncEntry> };
    if (!entries || entries.length === 0) {
      throw AppError.fromHttpStatus(400, "entries array is required.");
    }
    const limitErr = dncImportLimitError(entries.length);
    if (limitErr) {
      return res.status(400).json({
        code: "BAD_REQUEST",
        error: limitErr,
        max: DNC_IMPORT_MAX_ENTRIES,
      });
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

    if (rows.length === 0) throw AppError.fromHttpStatus(400, "No valid phone numbers provided.");

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
        void sentinel.terminateActiveCallsForNumber(row.phone, req.user.id).catch((err) =>
          log.error("sentinel terminate-on-DNC failed", {
            phone: phoneSuffixForLog(row.phone),
            error: getErrorMessage(err),
          }),
        );
      }
    }
    res.json({ success: true, added });
  } catch (e: any) {
    if (e instanceof AppError) throw e; // preserve the 400s above
    log.error("DNC add failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to add to DNC list.");
  }
});

// Remove a number from DNC list
router.delete(
  "/api/dnc/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const removed = await drizzle
        .delete(schema.dncList)
        .where(and(eq(schema.dncList.id, req.params.id), eq(schema.dncList.userId, req.user.id)))
        .returning({ id: schema.dncList.id });

      if (!removed.length) {
        throw AppError.fromHttpStatus(404, "DNC entry not found.");
      }

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
      if (e instanceof AppError) throw e; // preserve the 404 not-found above
      log.error("DNC delete failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to remove DNC entry.");
    }
  },
);

// ==========================================
// TCPA CONSENT CHECK
// ==========================================

/**
 * GET /api/tcpa/consent-check?phone=+14155551234&is_marketing=true
 * Returns the TCPA consent gate decision before an outbound call is placed.
 * Internally checks wireline_dnc for the calling user's DNC list.
 */
router.get(
  "/api/tcpa/consent-check",
  authenticateUser,
  tcpaRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const phone = String(req.query.phone || "").trim();
      if (!phone) throw AppError.fromHttpStatus(400, "phone query param required");

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
      if (err instanceof AppError) throw err; // preserve the 400 missing-phone above
      log.error("GET /api/tcpa/consent-check failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Consent check failed");
    }
  },
);

// ==========================================
// COMPLIANCE CENTER
// ==========================================

router.get(
  "/api/compliance/center",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [dncCountRow, consentCountRow, recentConsent] = await Promise.all([
        drizzle
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.dncList)
          .where(eq(schema.dncList.userId, req.user.id)),
        drizzle
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.consentLog)
          .where(eq(schema.consentLog.userId, req.user.id)),
        drizzle
          .select({
            id: schema.consentLog.id,
            event: schema.consentLog.event,
            customerNumber: schema.consentLog.customerNumber,
            callId: schema.consentLog.callId,
            state: schema.consentLog.state,
            createdAt: schema.consentLog.createdAt,
          })
          .from(schema.consentLog)
          .where(eq(schema.consentLog.userId, req.user.id))
          .orderBy(desc(schema.consentLog.createdAt))
          .limit(25),
      ]);

      res.json({
        federal_dnc_configured: isFederalDncVendorConfigured(),
        dnc_entry_count: Number(dncCountRow[0]?.count ?? 0),
        consent_event_count: Number(consentCountRow[0]?.count ?? 0),
        consent_rule_version: CONSENT_RULE_VERSION,
        recent_consent_events: (recentConsent || []).map((row) => ({
          id: row.id?.toString(),
          event: row.event,
          customer_number: row.customerNumber,
          call_id: row.callId,
          state: row.state,
          created_at: row.createdAt,
        })),
        audit_export_path: "/api/account/export",
        trust_pack_path: "/trust",
      });
    } catch (e: any) {
      log.error("Compliance center summary failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load compliance center.");
    }
  },
);

router.get(
  "/api/compliance/consent-log",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select({
          id: schema.consentLog.id,
          event: schema.consentLog.event,
          customerNumber: schema.consentLog.customerNumber,
          callId: schema.consentLog.callId,
          rule: schema.consentLog.rule,
          state: schema.consentLog.state,
          metadata: schema.consentLog.metadata,
          createdAt: schema.consentLog.createdAt,
        })
        .from(schema.consentLog)
        .where(eq(schema.consentLog.userId, req.user.id))
        .orderBy(desc(schema.consentLog.createdAt))
        .limit(100);

      res.json({
        entries: (rows || []).map((row) => ({
          id: row.id?.toString(),
          event: row.event,
          customer_number: row.customerNumber,
          call_id: row.callId,
          rule: row.rule,
          state: row.state,
          metadata: row.metadata,
          created_at: row.createdAt,
        })),
      });
    } catch (e: any) {
      log.error("Consent log fetch failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to fetch consent log.");
    }
  },
);

export default router;
