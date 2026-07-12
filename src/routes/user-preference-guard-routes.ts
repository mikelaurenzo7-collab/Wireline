import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { userPreferencesRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

type PreferenceEnvelope = Record<string, unknown>;

function preferenceEnvelope(value: unknown): PreferenceEnvelope {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as PreferenceEnvelope) }
    : {};
}

/**
 * Canonical preference writer. This route intentionally precedes the legacy
 * settings router, terminates the request, and serializes with Company Identity
 * writes. The client-supplied envelope can never replace the server-owned
 * company_identity namespace, including during concurrent saves.
 */
router.post(
  "/api/user-preferences",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body ?? {};
      const update: Record<string, unknown> = {};
      if (typeof body.persona === "string" || body.persona === null) {
        update.persona = body.persona;
      }
      if (typeof body.tour_completed === "boolean") update.tourCompleted = body.tour_completed;
      if (typeof body.onboarding_completed === "boolean") {
        update.onboardingCompleted = body.onboarding_completed;
      }
      if (typeof body.help_enabled === "boolean") update.helpEnabled = body.help_enabled;
      if (typeof body.keyboard_shortcuts_enabled === "boolean") {
        update.keyboardShortcutsEnabled = body.keyboard_shortcuts_enabled;
      }
      if (body.preferences && typeof body.preferences === "object") {
        update.preferences = preferenceEnvelope(body.preferences);
      }

      if (Object.keys(update).length === 0) {
        throw AppError.fromHttpStatus(400, "No valid preference fields supplied.");
      }

      const [data] = await drizzle.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('company-identity'), hashtext(${req.user.id}))`,
        );
        await tx.execute(
          sql`SELECT user_id FROM wireline_user_preferences WHERE user_id = ${req.user.id} FOR UPDATE`,
        );

        if (update.preferences) {
          const [existing] = await tx
            .select({ preferences: schema.userPreferences.preferences })
            .from(schema.userPreferences)
            .where(eq(schema.userPreferences.userId, req.user.id))
            .limit(1);
          const currentEnvelope = preferenceEnvelope(existing?.preferences);
          const requestedEnvelope = preferenceEnvelope(update.preferences);
          if (Object.prototype.hasOwnProperty.call(currentEnvelope, "company_identity")) {
            requestedEnvelope.company_identity = currentEnvelope.company_identity;
          } else {
            delete requestedEnvelope.company_identity;
          }
          update.preferences = requestedEnvelope;
        }

        return tx
          .insert(schema.userPreferences)
          .values({
            ...update,
            userId: req.user.id,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.userPreferences.userId,
            set: { ...update, updatedAt: new Date() },
          })
          .returning();
      });

      res.json({
        preferences: {
          tour_completed: data?.tourCompleted ?? false,
          onboarding_completed: data?.onboardingCompleted ?? false,
          help_enabled: data?.helpEnabled ?? true,
          keyboard_shortcuts_enabled: data?.keyboardShortcutsEnabled ?? true,
          persona: data?.persona ?? null,
          preferences: data?.preferences ?? {},
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update guarded preferences", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to update preferences");
    }
  },
);

export default router;
