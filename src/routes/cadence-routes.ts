/**
 * Multi-touch outbound cadence routes.
 *
 * A cadence is a sequence of touchpoints (call / sms / email) with delays.
 * Operators create one, enroll leads into it, and the job-worker ticks
 * through each step automatically.
 *
 * Endpoints:
 *   GET    /api/cadences                 — list this tenant's cadences
 *   POST   /api/cadences                 — create a new cadence
 *   PATCH  /api/cadences/:id             — rename / toggle / replace steps
 *   DELETE /api/cadences/:id             — delete (cascade pauses runs)
 *   POST   /api/cadences/:id/enroll      — enroll a lead — body { leadId }
 *   POST   /api/cadences/runs/:id/pause  — pause a single lead's run
 *   GET    /api/cadences/runs            — list active runs for the tenant
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

interface CadenceStep {
  type: "call" | "sms" | "email";
  delayHours: number;
  template?: string;
  agentId?: string;
}

function validateSteps(input: any): CadenceStep[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("steps must be a non-empty array");
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw new Error(`step ${i}: must be an object`);
    }
    const t = raw.type;
    if (t !== "call" && t !== "sms" && t !== "email") {
      throw new Error(`step ${i}: type must be call | sms | email`);
    }
    const delayHours = Number(raw.delayHours);
    if (!Number.isFinite(delayHours) || delayHours < 0) {
      throw new Error(`step ${i}: delayHours must be a non-negative number`);
    }
    return {
      type: t,
      delayHours,
      template: typeof raw.template === "string" ? raw.template : undefined,
      agentId: typeof raw.agentId === "string" ? raw.agentId : undefined,
    } satisfies CadenceStep;
  });
}

router.get("/api/cadences", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  const rows = await drizzle
    .select()
    .from(schema.cadences)
    .where(eq(schema.cadences.userId, req.user.id))
    .orderBy(desc(schema.cadences.createdAt));
  res.json({ cadences: rows });
});

router.post("/api/cadences", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
  try {
    const name = (req.body?.name || "").toString().trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    const steps = validateSteps(req.body?.steps);
    const [row] = (await drizzle
      .insert(schema.cadences)
      .values({
        userId: req.user.id,
        name,
        description: req.body?.description || null,
        agentId: req.body?.agentId || null,
        steps,
        active: req.body?.active !== false,
      })
      .returning()) as any[];
    res.json({ cadence: row });
  } catch (e: any) {
    res.status(400).json({ error: e?.message || "Invalid cadence" });
  }
});

router.patch(
  "/api/cadences/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const patch: Record<string, any> = {};
    if (typeof req.body?.name === "string") patch.name = req.body.name;
    if (typeof req.body?.description === "string") patch.description = req.body.description;
    if (typeof req.body?.agentId === "string") patch.agentId = req.body.agentId;
    if (typeof req.body?.active === "boolean") patch.active = req.body.active;
    if (Array.isArray(req.body?.steps)) {
      try {
        patch.steps = validateSteps(req.body.steps);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || "Invalid steps" });
      }
    }
    const [row] = (await drizzle
      .update(schema.cadences)
      .set(patch)
      .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)))
      .returning()) as any[];
    if (!row) return res.status(404).json({ error: "Cadence not found" });
    res.json({ cadence: row });
  },
);

router.delete(
  "/api/cadences/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    await drizzle
      .delete(schema.cadences)
      .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)));
    // Pause any active runs for this cadence so the worker doesn't trip.
    await drizzle
      .update(schema.cadenceRuns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(
          eq(schema.cadenceRuns.cadenceId, req.params.id),
          eq(schema.cadenceRuns.userId, req.user.id),
        ),
      );
    res.json({ ok: true });
  },
);

router.post(
  "/api/cadences/:id/enroll",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const leadId = req.body?.leadId;
    if (!leadId) return res.status(400).json({ error: "leadId is required" });

    // Safe-parse the leadId — BigInt(undefined) or BigInt("not a number") throws.
    let leadIdBig: bigint;
    try {
      leadIdBig = BigInt(leadId);
    } catch {
      return res.status(400).json({ error: "leadId must be a numeric id" });
    }

    const [cadence] = await drizzle
      .select()
      .from(schema.cadences)
      .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)))
      .limit(1);
    if (!cadence) return res.status(404).json({ error: "Cadence not found" });
    if (cadence.active === false) {
      return res.status(400).json({ error: "Cadence is inactive — re-enable before enrolling." });
    }

    // CRITICAL: verify the lead belongs to the requesting tenant. Without this,
    // an attacker could enroll any tenant's lead in their own cadence —
    // cross-tenant data linkage + workflow manipulation.
    const [lead] = await drizzle
      .select({ id: schema.outboundLeads.id })
      .from(schema.outboundLeads)
      .where(
        and(eq(schema.outboundLeads.id, leadIdBig), eq(schema.outboundLeads.userId, req.user.id)),
      )
      .limit(1);
    if (!lead) {
      // Generic 404 so attackers can't enumerate other tenants' lead ids.
      return res.status(404).json({ error: "Lead not found" });
    }

    const steps = cadence.steps as CadenceStep[];
    const firstDelay = steps[0]?.delayHours ?? 0;
    const nextDueAt = new Date(Date.now() + firstDelay * 3_600_000);

    try {
      const [run] = (await drizzle
        .insert(schema.cadenceRuns)
        .values({
          userId: req.user.id,
          cadenceId: cadence.id,
          leadId: leadIdBig,
          currentStep: 0,
          nextDueAt,
          status: "active",
        })
        .returning()) as any[];
      return res.json({ run });
    } catch (e: any) {
      if (e?.code === "23505" || /duplicate key/i.test(e?.message || "")) {
        return res.status(409).json({ error: "Lead is already enrolled in this cadence." });
      }
      log.error("Cadence enroll failed", { error: e?.message });
      return res.status(500).json({ error: "Enroll failed" });
    }
  },
);

router.post(
  "/api/cadences/runs/:id/pause",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const [row] = (await drizzle
      .update(schema.cadenceRuns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(
        and(eq(schema.cadenceRuns.id, req.params.id), eq(schema.cadenceRuns.userId, req.user.id)),
      )
      .returning()) as any[];
    if (!row) return res.status(404).json({ error: "Run not found" });
    res.json({ run: row });
  },
);

router.get(
  "/api/cadences/runs",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const rows = await drizzle
      .select()
      .from(schema.cadenceRuns)
      .where(eq(schema.cadenceRuns.userId, req.user.id))
      .orderBy(desc(schema.cadenceRuns.createdAt))
      .limit(200);
    res.json({ runs: rows });
  },
);

export default router;
