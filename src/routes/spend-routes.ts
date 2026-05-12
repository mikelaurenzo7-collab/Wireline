import { Router } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { clearBudgetCache, getBudgetSnapshot } from "../lib/spend-guards";

const router = Router();

router.put("/api/spend/budget", authenticateUser, async (req: any, res: any) => {
  try {
    const limit = Number(req.body.monthly_limit_usd ?? 0);
    const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
    const hardCap = !!req.body.hard_cap;
    const enabled = req.body.enabled !== false;
    if (!Number.isFinite(limit) || limit < 0) return res.status(400).json({ error: "monthly_limit_usd must be a non-negative number" });
    if (!Number.isInteger(warn) || warn < 1 || warn > 99) return res.status(400).json({ error: "warn_threshold_pct must be 1–99" });

    const { data, error } = await db.from("wireline_spend_budgets")
      .upsert({
        user_id: req.user.id,
        monthly_limit_usd: limit,
        hard_cap: hardCap,
        warn_threshold_pct: warn,
        enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select().single();
    if (error) throw error;
    // Force a cache refresh so the new limit takes effect on the next request.
    clearBudgetCache(req.user.id);
    res.json({ budget: data });
  } catch (e: any) { 
    log.error("Failed to save budget", { error: e instanceof Error ? e.message : String(e) }); 
    res.status(500).json({ error: "Failed to save budget" }); 
  }
});

router.get("/api/spend/status", authenticateUser, async (req: any, res: any) => {
  try {
    const snap = await getBudgetSnapshot(req.user.id, true);
    const { data: alerts } = await db.from("wireline_spend_alerts")
      .select("threshold_pct, fired_at")
      .eq("user_id", req.user.id).eq("period", snap.period)
      .order("threshold_pct", { ascending: true });
    const limit = snap.budget?.monthly_limit_usd || 0;
    const pct = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
    res.json({
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: limit,
      percent_used: Number(pct.toFixed(1)),
      hard_cap: snap.budget?.hard_cap ?? false,
      enabled: snap.budget?.enabled ?? true,
      warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
      hard_capped_now: !!(snap.budget?.hard_cap && limit > 0 && snap.mtdCost >= limit),
      alerts_fired: alerts || [],
    });
  } catch (e: any) { 
    log.error("Failed to load spend status", { error: e instanceof Error ? e.message : String(e) }); 
    res.status(500).json({ error: "Failed to load spend status" }); 
  }
});

export default router;
