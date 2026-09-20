/* eslint-disable @typescript-eslint/no-explicit-any -- tenant configuration columns and aggregated drizzle rows have shapes that vary by route. */
/**
 * Multi-touch outbound cadence routes.
 *
 * A cadence is a sequence of touchpoints (call / sms / email) with delays.
 * Account Holders create one, enroll leads into it, and the job-worker ticks
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
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { validateBody, createCadenceSchema, updateCadenceSchema } from "../lib/api-validation";

const router = Router();

interface CadenceStep {
  type: "call" | "sms" | "email";
  delayHours: number;
  template?: string;
  agentId?: string;
}

function validateSteps(input: any): CadenceStep[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw AppError.badRequest("steps must be a non-empty array");
  }
  return input.map((raw, i) => {
    if (!raw || typeof raw !== "object") {
      throw AppError.badRequest(`step ${i}: must be an object`);
    }
    const t = raw.type;
    if (t !== "call" && t !== "sms" && t !== "email") {
      throw AppError.badRequest(`step ${i}: type must be call | sms | email`);
    }
    const delayHours = Number(raw.delayHours);
    if (
      !Number.isFinite(delayHours) ||
      delayHours < 0 ||
      !Number.isFinite(new Date(Date.now() + delayHours * 3_600_000).getTime())
    ) {
      throw AppError.badRequest(`step ${i}: delayHours must be a valid non-negative delay`);
    }
    return {
      type: t,
      delayHours,
      template: typeof raw.template === "string" ? raw.template : undefined,
      agentId: typeof raw.agentId === "string" ? raw.agentId.trim() || undefined : undefined,
    } satisfies CadenceStep;
  });
}

async function assertCadenceAgentsOwned(
  userId: string,
  agentId?: string | null,
  steps: CadenceStep[] = [],
) {
  const ids = [
    ...new Set(
      [agentId, ...steps.map((step) => step.agentId)].filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!ids.length) return;
  const agents = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.userId, userId), inArray(schema.agents.id, ids)));
  const ownedIds = new Set(agents.map((agent) => agent.id));
  if (ids.some((id) => !ownedIds.has(id))) throw AppError.notFound("Bot not found.");
}

router.get("/api/cadences", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
  const rows = await drizzle
    .select()
    .from(schema.cadences)
    .where(eq(schema.cadences.userId, req.user.id))
    .orderBy(desc(schema.cadences.createdAt));
  res.json({ cadences: rows });
});

router.post(
  "/api/cadences",
  authenticateUser,
  validateBody(createCadenceSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    try {
      const name = (req.body?.name || "").toString().trim();
      const steps = validateSteps(req.body?.steps);
      await assertCadenceAgentsOwned(req.user.id, req.body?.agentId, steps);
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
      if (e instanceof AppError) throw e;
      log.error("Create cadence failed", { userId: req.user.id, error: e?.message });
      throw AppError.internal("Could not save this sequence.");
    }
  },
);

router.patch(
  "/api/cadences/:id",
  authenticateUser,
  validateBody(updateCadenceSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const patch: Record<string, any> = {};
    if (req.body?.name !== undefined) patch.name = req.body.name;
    if (req.body?.description !== undefined) patch.description = req.body.description;
    if (req.body?.agentId !== undefined) patch.agentId = req.body.agentId;
    if (req.body?.active !== undefined) patch.active = req.body.active;
    if (req.body?.steps !== undefined) {
      try {
        patch.steps = validateSteps(req.body.steps);
      } catch (e: any) {
        throw AppError.fromHttpStatus(400, String(e?.message || "Invalid steps"));
      }
    }
    if (!Object.keys(patch).length) throw AppError.badRequest("No changes supplied.");
    await assertCadenceAgentsOwned(req.user.id, patch.agentId, patch.steps);
    const row = await drizzle.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.cadences)
        .set(patch)
        .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)))
        .returning();
      if (!updated) throw AppError.fromHttpStatus(404, "Cadence not found");
      if (patch.active === true) {
        // Recover only the legacy parent-pause bug on an explicit resume.
        // A newer enrollment (including completed work) supersedes the old run.
        // Enrollment holds this same parent row lock to avoid a unique-index race.
        await tx
          .update(schema.cadenceRuns)
          .set({
            status: "active",
            lastResult: "resumed after sequence pause",
            updatedAt: new Date(),
            nextDueAt: sql`coalesce(${schema.cadenceRuns.nextDueAt}, now())`,
          })
          .where(
            and(
              eq(schema.cadenceRuns.userId, req.user.id),
              eq(schema.cadenceRuns.cadenceId, req.params.id),
              eq(schema.cadenceRuns.status, "paused"),
              eq(schema.cadenceRuns.lastResult, "cadence inactive or deleted"),
              sql`not exists (select 1 from ${schema.cadenceRuns} as newer where newer.user_id = ${schema.cadenceRuns.userId} and newer.cadence_id = ${schema.cadenceRuns.cadenceId} and newer.lead_id = ${schema.cadenceRuns.leadId} and newer.id <> ${schema.cadenceRuns.id} and (newer.status = 'active' or (coalesce(newer.created_at, 'epoch'::timestamptz), newer.id) > (coalesce(${schema.cadenceRuns.createdAt}, 'epoch'::timestamptz), ${schema.cadenceRuns.id})))`,
            ),
          );
      }
      return updated;
    });
    res.json({ cadence: row });
  },
);

router.delete(
  "/api/cadences/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    await drizzle.transaction(async (tx) => {
      await tx
        .delete(schema.cadences)
        .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)));
      // Keep settled history and existing review reasons intact. Enrollment
      // locks the same parent row, so it cannot race between these writes.
      await tx
        .update(schema.cadenceRuns)
        .set({ status: "paused", nextDueAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(schema.cadenceRuns.cadenceId, req.params.id),
            eq(schema.cadenceRuns.userId, req.user.id),
            eq(schema.cadenceRuns.status, "active"),
          ),
        );
    });
    res.json({ ok: true });
  },
);

router.post(
  "/api/cadences/:id/enroll",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const leadId = req.body?.leadId;
    if (!leadId) throw AppError.fromHttpStatus(400, "leadId is required");

    // Safe-parse the leadId — BigInt(undefined) or BigInt("not a number") throws.
    let leadIdBig: bigint;
    try {
      leadIdBig = BigInt(leadId);
    } catch {
      throw AppError.fromHttpStatus(400, "leadId must be a numeric id");
    }

    const enrolled = await drizzle.transaction(async (tx) => {
      const [cadence] = await tx
        .select()
        .from(schema.cadences)
        .where(and(eq(schema.cadences.id, req.params.id), eq(schema.cadences.userId, req.user.id)))
        .limit(1)
        .for("update");
      if (!cadence) throw AppError.fromHttpStatus(404, "Cadence not found");
      if (cadence.active === false) {
        throw AppError.fromHttpStatus(400, "Cadence is inactive, re-enable before enrolling.");
      }

      // CRITICAL: verify the lead belongs to the requesting tenant. Without this,
      // an attacker could enroll any tenant's lead in their own cadence —
      // cross-tenant data linkage + workflow manipulation.
      const [lead] = await tx
        .select({ id: schema.outboundLeads.id })
        .from(schema.outboundLeads)
        .where(
          and(eq(schema.outboundLeads.id, leadIdBig), eq(schema.outboundLeads.userId, req.user.id)),
        )
        .limit(1);
      if (!lead) {
        // Generic 404 so attackers can't enumerate other tenants' lead ids.
        throw AppError.fromHttpStatus(404, "Lead not found");
      }

      const steps = cadence.steps as CadenceStep[];
      const firstDelay = steps[0]?.delayHours ?? 0;
      const nextDueAt = new Date(Date.now() + firstDelay * 3_600_000);

      try {
        const [run] = (await tx
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
        return run;
      } catch (e: any) {
        if (e?.code === "23505" || /duplicate key/i.test(e?.message || "")) {
          throw AppError.fromHttpStatus(409, "Lead is already enrolled in this cadence.");
        }
        log.error("Cadence enroll failed", { error: e?.message });
        throw AppError.fromHttpStatus(500, "Enroll failed");
      }
    });
    res.json({ run: enrolled });
  },
);

router.post(
  "/api/cadences/runs/:id/pause",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const [row] = (await drizzle
      .update(schema.cadenceRuns)
      .set({
        status: "paused",
        nextDueAt: null,
        updatedAt: new Date(),
        lastResult: "paused by account holder",
      })
      .where(
        and(
          eq(schema.cadenceRuns.id, req.params.id),
          eq(schema.cadenceRuns.userId, req.user.id),
          eq(schema.cadenceRuns.status, "active"),
        ),
      )
      .returning()) as any[];
    if (!row) {
      const [existing] = await drizzle
        .select()
        .from(schema.cadenceRuns)
        .where(
          and(eq(schema.cadenceRuns.id, req.params.id), eq(schema.cadenceRuns.userId, req.user.id)),
        )
        .limit(1);
      if (!existing) throw AppError.fromHttpStatus(404, "Run not found");
      if (existing.status !== "paused")
        throw AppError.fromHttpStatus(409, "Only active runs can be paused.");
      return res.json({ run: existing });
    }
    res.json({ run: row });
  },
);

router.get(
  "/api/cadences/runs",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const rows = await drizzle
      .select({
        ...getTableColumns(schema.cadenceRuns),
        contactName: schema.outboundLeads.customerName,
        contactNumber: schema.outboundLeads.customerNumber,
        contactEmail: schema.outboundLeads.email,
      })
      .from(schema.cadenceRuns)
      .leftJoin(
        schema.outboundLeads,
        and(
          eq(schema.outboundLeads.id, schema.cadenceRuns.leadId),
          eq(schema.outboundLeads.userId, schema.cadenceRuns.userId),
        ),
      )
      .where(
        and(
          eq(schema.cadenceRuns.userId, req.user.id),
          or(
            inArray(schema.cadenceRuns.status, ["active", "paused", "failed"]),
            inArray(
              schema.cadenceRuns.id,
              drizzle
                .select({ id: schema.cadenceRuns.id })
                .from(schema.cadenceRuns)
                .where(eq(schema.cadenceRuns.userId, req.user.id))
                .orderBy(desc(schema.cadenceRuns.createdAt))
                .limit(200),
            ),
          ),
        ),
      )
      .orderBy(desc(schema.cadenceRuns.createdAt));
    res.json({ runs: rows });
  },
);

export default router;
