import { Router, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { optionalAuth, authorizeMigration } from "./admin-migrate/auth";
import { getOperatingCockpitPayload } from "../lib/operating-cockpit";
import { getTenantEconomics, countAtRiskTenants } from "../lib/tenant-economics";
import { evaluateLaunchReadiness } from "../lib/launch-readiness";
import { getErrorMessage } from "../lib/server-utils";
import { log, drizzle } from "../lib/server-context";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const router = Router();

router.get(
  "/api/admin/operating-cockpit",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    try {
      let ownerId = req.user?.id;
      if (!ownerId && process.env.OWNER_EMAIL) {
        const ownerRow = await drizzle
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(sql`lower(${schema.users.email}) = lower(${process.env.OWNER_EMAIL})`)
          .limit(1);
        ownerId = ownerRow[0]?.id;
      }
      if (!ownerId) {
        return res
          .status(412)
          .json({ ok: false, code: "PRECONDITION_FAILED", error: "Owner account not found" });
      }
      const payload = await getOperatingCockpitPayload(String(ownerId));
      return res.json(payload);
    } catch (e: unknown) {
      log.error("operating-cockpit failed", { error: getErrorMessage(e) });
      return res
        .status(500)
        .json({ ok: false, code: "INTERNAL_ERROR", error: "Operating overview query failed" });
    }
  },
);

router.get(
  "/api/admin/tenant-economics",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    const userId = String(req.query.user_id || "");
    if (!userId) {
      return res
        .status(400)
        .json({ ok: false, code: "BAD_REQUEST", error: "user_id query param required" });
    }
    try {
      const economics = await getTenantEconomics(userId);
      return res.json({ ok: true, economics });
    } catch (e: unknown) {
      log.error("tenant-economics failed", { error: getErrorMessage(e) });
      return res
        .status(500)
        .json({ ok: false, code: "INTERNAL_ERROR", error: "Tenant economics query failed" });
    }
  },
);

router.get(
  "/api/admin/launch-readiness",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    return res.json({ ok: true, ...evaluateLaunchReadiness() });
  },
);

router.get(
  "/api/admin/economics-at-risk-count",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    try {
      const count = await countAtRiskTenants();
      return res.json({ ok: true, economics_at_risk_count: count });
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", error: getErrorMessage(e) });
    }
  },
);

router.get(
  "/api/admin/trust-pack/soc2",
  optionalAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!authorizeMigration(req, res)) return;
    try {
      const path = resolve(process.cwd(), "docs/SOC2_EVIDENCE_PACK.md");
      const body = readFileSync(path, "utf8");
      res.setHeader("Content-Type", "text/markdown; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="wireline-soc2-evidence-index.md"',
      );
      return res.send(body);
    } catch (e: unknown) {
      return res.status(500).json({ ok: false, code: "INTERNAL_ERROR", error: getErrorMessage(e) });
    }
  },
);

export default router;
