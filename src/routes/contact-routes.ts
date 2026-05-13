import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { normalizePhoneTail, buildContactProfile } from "../lib/contact-profile";
import { claudeErr } from "../lib/claude-response-helpers";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// ──────────────────────────────────────────────────────────
//  CONTACT PROFILE — unified per-customer history
// ──────────────────────────────────────────────────────────

router.get("/api/contacts/:number", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const number = decodeURIComponent(req.params.number);
    const norm = normalizePhoneTail(number);
    if (!norm) return res.status(400).json({ error: "Invalid phone number." });

    // Match: exact, or anything ending in the same last-10-digits.
    const [callsRes, leadsRes, apptsRes] = await Promise.all([
      db.from("wireline_call_logs")
        .select("id, agent_id, direction, customer_number, duration_seconds, cost, summary, transcript, recording_url, lead_score, intent_label, created_at")
        .eq("user_id", req.user.id)
        .ilike("customer_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_outbound_leads")
        .select("id, agent_id, customer_name, status, context, last_called_at, created_at, phone_number")
        .eq("user_id", req.user.id)
        .ilike("phone_number", `%${norm}`)
        .order("created_at", { ascending: false }),
      db.from("wireline_appointments")
        .select("id, agent_id, customer_name, service_type, date, time, status, created_at")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false }),
    ]);

    res.json(buildContactProfile({
      number,
      normalized: norm,
      calls:  callsRes.data  || [],
      leads:  leadsRes.data  || [],
      appts:  apptsRes.data  || [],
    }));
  } catch (e) {
    log.error("Contact profile fetch failed", { error: e instanceof Error ? e.message : String(e) });
    claudeErr(res, e);
  }
});

export default router;
