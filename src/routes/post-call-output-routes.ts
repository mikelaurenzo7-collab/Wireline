import { Router, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { enqueue } from "../lib/job-queue";
import {
  POST_CALL_ARTIFACT_DESTINATIONS,
  POST_CALL_ARTIFACT_FORMATS,
  POST_CALL_ARTIFACT_MODES,
  POST_CALL_SPREADSHEET_DESTINATIONS,
  SCHEDULED_REPORT_FREQUENCIES,
  getPostCallOutputPreferences,
  normalizePostCallOutputPreferences,
  savePostCallOutputPreferences,
  type PostCallArtifactDestination,
} from "../lib/post-call-output-preferences";
import {
  ensureNextScheduledReport,
  nextScheduledReportAt,
} from "../lib/scheduled-report-service";
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
    scheduled_report_frequency: z.enum(SCHEDULED_REPORT_FREQUENCIES).optional(),
    scheduled_report_format: z.enum(POST_CALL_ARTIFACT_FORMATS).optional(),
    scheduled_report_destination: z.enum(POST_CALL_ARTIFACT_DESTINATIONS).nullable().optional(),
    scheduled_report_send_at_utc: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a valid UTC time.")
      .optional(),
    scheduled_report_weekday: z.number().int().min(0).max(6).optional(),
  })
  .strict();

const artifactRequestSchema = z
  .object({
    format: z.enum(POST_CALL_ARTIFACT_FORMATS).optional(),
    destination: z.enum(POST_CALL_ARTIFACT_DESTINATIONS).optional(),
  })
  .strict();

type ConnectionState = Awaited<ReturnType<typeof connectionState>>;

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

function destinationConnected(
  destination: PostCallArtifactDestination | null,
  connections: ConnectionState,
): boolean {
  if (!destination) return false;
  return destination === "google_drive" ? connections.google_drive : connections.onedrive;
}

function validatePreferencesAgainstConnections(
  preferences: ReturnType<typeof normalizePostCallOutputPreferences>,
  connections: ConnectionState,
): void {
  if (
    preferences.artifact_mode === "manual" &&
    preferences.artifact_destination &&
    !destinationConnected(preferences.artifact_destination, connections)
  ) {
    throw AppError.fromHttpStatus(
      409,
      "Connect the selected Google or Microsoft storage destination before enabling special reports.",
    );
  }
  if (preferences.scheduled_report_frequency !== "off") {
    if (!preferences.scheduled_report_destination) {
      throw AppError.fromHttpStatus(400, "Choose where scheduled reports should be saved.");
    }
    if (!destinationConnected(preferences.scheduled_report_destination, connections)) {
      throw AppError.fromHttpStatus(
        409,
        "Connect the selected Google or Microsoft storage destination before scheduling reports.",
      );
    }
  }
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
        next_scheduled_report_at: nextScheduledReportAt(preferences)?.toISOString() || null,
        policy: {
          internal_record_required: true,
          external_artifacts_optional: true,
          per_call_artifacts_manual_only: true,
          scheduled_reports_opt_in: true,
          wireline_file_storage: "metadata_only",
          artifact_generation: "connector_destination_required",
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
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
      const [current, connections] = await Promise.all([
        getPostCallOutputPreferences(req.user.id),
        connectionState(req.user.id),
      ]);
      const proposed = normalizePostCallOutputPreferences({ ...current, ...parsed.data });
      validatePreferencesAgainstConnections(proposed, connections);

      const preferences = await savePostCallOutputPreferences(req.user.id, parsed.data);
      const jobId =
        preferences.scheduled_report_frequency === "off"
          ? null
          : await ensureNextScheduledReport(req.user.id, preferences);
      res.json({
        preferences,
        connections,
        scheduled_job_id: jobId,
        next_scheduled_report_at: nextScheduledReportAt(preferences)?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("post-call output preferences save failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to save post-call output preferences.");
    }
  },
);

router.post(
  "/api/call-logs/:callLogId/artifact",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = artifactRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw AppError.fromHttpStatus(400, "Choose a valid report format and destination.");
    }

    let callLogId: bigint;
    try {
      callLogId = BigInt(String(req.params.callLogId || ""));
    } catch {
      throw AppError.fromHttpStatus(400, "Invalid call record id.");
    }

    try {
      const [call, preferences, connections] = await Promise.all([
        drizzle
          .select({
            id: schema.callLogs.id,
            agentId: schema.callLogs.agentId,
            agentName: schema.agents.name,
            direction: schema.callLogs.direction,
            customerNumber: schema.callLogs.customerNumber,
            durationSeconds: schema.callLogs.durationSeconds,
            outcomeTag: schema.callLogs.outcomeTag,
            summary: schema.callLogs.summary,
            transcript: schema.callLogs.transcript,
            sentiment: schema.callLogs.sentiment,
            intentLabel: schema.callLogs.intentLabel,
            campaignSource: schema.callLogs.campaignSource,
          })
          .from(schema.callLogs)
          .leftJoin(schema.agents, eq(schema.callLogs.agentId, schema.agents.id))
          .where(
            and(
              eq(schema.callLogs.id, callLogId),
              eq(schema.callLogs.userId, req.user.id),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] || null),
        getPostCallOutputPreferences(req.user.id),
        connectionState(req.user.id),
      ]);

      if (!call) throw AppError.fromHttpStatus(404, "Call record not found.");
      if (preferences.artifact_mode === "off") {
        throw AppError.fromHttpStatus(
          409,
          "Enable special call reports in Training before requesting a file.",
        );
      }

      const format = parsed.data.format || preferences.artifact_format;
      const destination = parsed.data.destination || preferences.artifact_destination;
      if (!destination) {
        throw AppError.fromHttpStatus(400, "Choose a Google Drive or OneDrive destination.");
      }
      if (!destinationConnected(destination, connections)) {
        throw AppError.fromHttpStatus(409, "Connect the selected destination before creating a file.");
      }

      const queued = await enqueue(drizzle, {
        userId: req.user.id,
        type: "post_call_artifact",
        maxAttempts: 3,
        payload: {
          userId: req.user.id,
          callLogId: String(call.id),
          agentName: call.agentName || null,
          customerNumber: call.customerNumber || null,
          direction: call.direction || null,
          durationSeconds: call.durationSeconds || 0,
          outcomeTag: call.outcomeTag || "call-report",
          summary: call.summary || null,
          transcript: call.transcript || null,
          sentiment: call.sentiment || null,
          intentLabel: call.intentLabel || null,
          campaignSource: call.campaignSource || null,
          format,
          destination,
          purpose: "call_report",
        },
      });
      if (!queued.ok || !queued.jobId) {
        throw new Error(queued.error || "Failed to queue report generation.");
      }

      res.status(202).json({
        ok: true,
        job_id: queued.jobId,
        status: "pending",
        format,
        destination,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("manual call artifact request failed", {
        userId: req.user.id,
        callLogId: String(req.params.callLogId || ""),
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to queue the requested call report.");
    }
  },
);

export default router;
