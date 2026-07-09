/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { authenticateUser } from "../middleware/auth";
import { soc2RateLimit } from "../middleware/api-rate-limits";
import { log, requirePermission, drizzle } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import {
  runAccessReview,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY,
  ALL_ROLES,
  buildIncidentRow,
} from "../lib/soc2-controls";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/**
 * GET /api/soc2/access-review — quarterly stale-access evidence (CC6).
 * Requires audit.read (owner/admin/auditor by default RBAC map).
 */
router.get(
  "/api/soc2/access-review",
  authenticateUser,
  soc2RateLimit,
  requirePermission("audit.read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user.id as string;
      const review = await runAccessReview(drizzle, tenantId);
      res.json(review);
    } catch (e: any) {
      log.error("GET /api/soc2/access-review failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to run access review.");
    }
  },
);

/**
 * GET /api/soc2/evidence-pack — static + dynamic SOC2 narrative helpers for auditors.
 */
router.get(
  "/api/soc2/evidence-pack",
  authenticateUser,
  soc2RateLimit,
  requirePermission("audit.read"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tenantId = req.user.id as string;
      const review = await runAccessReview(drizzle, tenantId);
      const incidentTemplate = buildIncidentRow({
        severity: "P3",
        title: "[Template] Service degradation — brief description",
        description:
          "Describe detection source, customer impact, containment, and remediation. Replace before external sharing.",
        detected_at: new Date().toISOString(),
        reporter_email: String(req.user.email || "security@example.invalid"),
        affected_systems: ["api", "postgres", "job_queue"],
      });

      res.json({
        generated_at: new Date().toISOString(),
        tenant_id: tenantId,
        frameworks: [
          {
            id: "SOC2_CC6",
            summary:
              "Logical access — RBAC enforced via wireline_team_members + requirePermission middleware.",
          },
          {
            id: "SOC2_CC7",
            summary:
              "Operations monitoring — platform health, job queue sweeps, webhook retries, and AI audit logging provide traceability.",
          },
          {
            id: "SOC2_CC8",
            summary:
              "Change management — configuration mutations emit wireline_audit_log rows with actor context.",
          },
        ],
        rbac_snapshot: {
          hierarchy: ROLE_HIERARCHY,
          roles: ALL_ROLES,
          permission_map: ROLE_PERMISSIONS,
        },
        quarterly_access_review: {
          cadence_days: 90,
          endpoint: "GET /api/soc2/access-review",
          snapshot: review,
          procedure:
            "Owner downloads this JSON, reviews stale_members, documents retain/revoke decisions, and stores with meeting minutes.",
        },
        incident_response_template: incidentTemplate,
        export_surfaces: {
          audit_activity: "/admin?tab=activity",
          ai_usage_summary: "GET /api/audit/summary",
          operational_slos: "GET /api/health/slos",
        },
      });
    } catch (e: any) {
      log.error("GET /api/soc2/evidence-pack failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to build evidence pack.");
    }
  },
);

export default router;
