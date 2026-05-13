import { Router, Response } from "express";
import { db, log, auditLogger } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { tcpaRateLimit } from "../middleware/api-rate-limits";
import { 
  evaluateOutboundConsent, 
  getConsentRuleForPhone, 
  CONSENT_RULE_VERSION 
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

interface DncRow {
  user_id: string;
  phone: string;
  phone_raw: string;
  reason: string | null;
  source: string;
}

// List DNC entries
router.get("/dnc", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db
      .from("wireline_dnc_list")
      .select("id, phone, phone_raw, reason, source, created_at")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ entries: data || [] });
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
    const rows: DncRow[] = entries
      .filter((e: DncEntry) => e.phone)
      .map((e: DncEntry) => ({
        user_id: req.user.id,
        phone: normalizeDncPhone(e.phone),
        phone_raw: e.phone,
        reason: e.reason || null,
        source: e.source || "manual",
      }))
      .filter((r: DncRow) => r.phone.length > 0);

    if (rows.length === 0) return res.status(400).json({ error: "No valid phone numbers provided." });

    const { data, error } = await db
      .from("wireline_dnc_list")
      .upsert(rows, { onConflict: "user_id,phone", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    const added = data?.length ?? 0;
    if (added > 0) {
      void auditLogger.logDnc('added', {
        userId: req.user.id,
        count: added,
        source: entries[0]?.source || 'manual',
        ip: req.ip,
        metadata: { requested: rows.length },
      }).catch(() => {});
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
    const { error } = await db
      .from("wireline_dnc_list")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    void auditLogger.logDnc('removed', {
      userId: req.user.id, count: 1, ip: req.ip, metadata: { dnc_id: req.params.id },
    }).catch(() => {});
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
router.get("/tcpa/consent-check", authenticateUser, tcpaRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const phone = String(req.query.phone || "").trim();
    if (!phone) return res.status(400).json({ error: "phone query param required" });

    const isMarketing = req.query.is_marketing !== "false";

    const [dncRow, settingsRow] = await Promise.all([
      db.from("wireline_dnc_list").select("id").eq("user_id", req.user.id).eq("phone", normalizeDncPhone(phone)).maybeSingle(),
      db.from("wireline_settings").select("business_name").eq("user_id", req.user.id).maybeSingle(),
    ]);

    const { rule, state } = getConsentRuleForPhone(phone);
    const decision = evaluateOutboundConsent({
      phone,
      is_internal_dnc: !!dncRow.data,
      is_marketing_call: isMarketing,
      has_express_written_consent: !isMarketing,
      business_name: (settingsRow.data as { business_name?: string } | null)?.business_name ?? undefined,
    });

    res.json({
      ...decision,
      inferred_state: state,
      rule,
      consent_rule_version: CONSENT_RULE_VERSION,
    });
  } catch (err: any) {
    log.error("GET /api/tcpa/consent-check failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Consent check failed" });
  }
});

export default router;

