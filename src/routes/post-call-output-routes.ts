import { Router, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import {
  POST_CALL_ARTIFACT_DESTINATIONS,
  POST_CALL_ARTIFACT_FORMATS,
  POST_CALL_ARTIFACT_MODES,
  POST_CALL_SPREADSHEET_DESTINATIONS,
  getPostCallOutputPreferences,
  savePostCallOutputPreferences,
} from "../lib/post-call-output-preferences";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const postCallOutputPatchSchema = z
  .object({
    spreadsheet_destination: z.enum(POST_CALL_SPREADSHEET_DESTINATIONS).optional(),
    artifact_mode: z.enum(POST_CALL_ARTIFACT_MODES).optional(),
    artifact_format: z.enum(POST_CALL_ARTIFACT_FORMATS).optional(),
    artifact_destination: z.enum(POST_CALL_ARTIFACT_DESTINATIONS).nullable().optional(),
  })
  .strict();

async function connectionState(userId: string) {
  const rows = await drizzle
    .select({ provider: schema.crmConnections.provider })
    .from(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        inArray(schema.crmConnections.provider, ["google_sheets", "microsoft_excel"]),
      ),
    );
  const providers = new Set(rows.map((row) => row.provider));
  return {
    google_sheets: providers.has("google_sheets"),
    microsoft_excel: providers.has("microsoft_excel"),
    google_drive: providers.has("google_sheets"),
    onedrive: providers.has("microsoft_excel"),
  };
}

router.get(
  "/api/post-call-output-preferences",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [preferences, connections] = await Promise.all([
        getPostCallOutputPreferences(req.user.id),
        connectionState(req.user.id),
      ]);
      res.json({
        preferences,
        connections,
        policy: {
          internal_record_required: true,
          external_artifacts_optional: true,
          wireline_file_storage: "metadata_only",
          artifact_generation: "connector_destination_required",
        },
      });
    } catch (error) {
      log.error("post-call output preferences fetch failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to load post-call output preferences.");
    }
  },
);

router.post(
  "/api/post-call-output-preferences",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = postCallOutputPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw AppError.fromHttpStatus(400, "Choose valid post-call output settings.");
    }
    if (Object.keys(parsed.data).length === 0) {
      throw AppError.fromHttpStatus(400, "No post-call output settings supplied.");
    }

    try {
      const preferences = await savePostCallOutputPreferences(req.user.id, parsed.data);
      const connections = await connectionState(req.user.id);
      res.json({ preferences, connections });
    } catch (error) {
      log.error("post-call output preferences save failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to save post-call output preferences.");
    }
  },
);

export default router;
