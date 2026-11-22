import { Router, type Response } from "express";
import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError, asyncHandler } from "../lib/api-error";
import { lockPreferenceEnvelope } from "../lib/preference-envelope";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { isVaultConfigured } from "../lib/secret-vault";
import {
  editableTextingRegistration,
  normalizeTextingRegistrationInput,
  openTextingRegistration,
  readStoredTextingRegistration,
  sealTextingRegistration,
  TEXTING_REGISTRATION_OPTIONS,
  TEXTING_REGISTRATION_PREFERENCE_KEY,
  validateTextingRegistration,
  type StoredTextingRegistration,
  type TextingRegistrationInput,
} from "../lib/texting-registration-details";
import { authenticateUser } from "../middleware/auth";
import { userPreferencesRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

/**
 * An owner's business details for US carrier texting registration. Saving
 * never submits anything to carriers or spends money: BotBound registers the
 * business with `carrier:register --workspace`, and Lines reads approval from
 * Twilio. See `texting-registration-details.ts` for storage.
 */
const router = Router();

type Reader = Pick<typeof drizzle, "select">;

function envelopeOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

async function loadState(userId: string, db: Reader = drizzle) {
  const [preferences] = await db
    .select({ preferences: schema.userPreferences.preferences })
    .from(schema.userPreferences)
    .where(eq(schema.userPreferences.userId, userId))
    .limit(1);
  const [settings] = await db
    .select({ brandName: schema.settings.brandName, businessName: schema.settings.businessName })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);
  const envelope = envelopeOf(preferences?.preferences);
  return { envelope, stored: readStoredTextingRegistration(envelope), settings };
}

function openOrNull(stored: StoredTextingRegistration | null): TextingRegistrationInput | null {
  if (!stored) return null;
  try {
    return openTextingRegistration(stored);
  } catch (error) {
    log.warn("Texting registration details could not be opened", {
      error: getErrorMessage(error),
    });
    return null;
  }
}

function payload(state: Awaited<ReturnType<typeof loadState>>) {
  const { stored, settings } = state;
  const opened = openOrNull(stored);
  return {
    status: stored ? "received" : "needs_details",
    flow: stored?.flow ?? null,
    summary: stored?.summary ?? null,
    details: opened ? editableTextingRegistration(opened) : null,
    submitted_at: stored?.submittedAt ?? null,
    updated_at: stored?.updatedAt ?? null,
    default_brand_name: settings?.brandName?.trim() || settings?.businessName?.trim() || null,
    options: TEXTING_REGISTRATION_OPTIONS,
  };
}

async function notifyFounder(userId: string, stored: StoredTextingRegistration) {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) return;
  try {
    const { sendEmail } = await import("../lib/email-service");
    const flow = stored.flow === "sole_proprietor" ? "Sole proprietor" : "Business with EIN";
    const command = `npm run carrier:register -- --workspace ${userId} --state <file>`;
    const text = `${stored.summary.brandName} (${stored.summary.city}, ${stored.summary.region}) sent business details for texting.\n\nFlow: ${flow}\nWorkspace: ${userId}\n\nDry run first:\n${command}`;
    const result = await sendEmail({
      to: ownerEmail,
      subject: `[BotBound] Texting registration details from ${stored.summary.brandName}`,
      text,
      html: `<pre>${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c)}</pre>`,
      idempotencyKey: `texting-registration-received/${userId}/${stored.submittedAt}`,
    });
    if (!result.ok) log.warn("Texting registration founder notice not sent", { userId });
  } catch (error) {
    log.warn("Texting registration founder notice failed", {
      userId,
      error: getErrorMessage(error),
    });
  }
}

router.get(
  "/api/texting-registration",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    res.json(payload(await loadState(req.user.id)));
  }),
);

router.put(
  "/api/texting-registration",
  authenticateUser,
  userPreferencesRateLimit,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!isVaultConfigured()) {
      throw new AppError(
        503,
        "SECURE_STORAGE_UNAVAILABLE",
        "Secure storage isn't available right now, so nothing was saved. Try again later.",
      );
    }
    const userId = req.user.id;
    let input = normalizeTextingRegistrationInput(req.body);

    const firstSubmission = await drizzle.transaction(async (tx) => {
      await lockPreferenceEnvelope(tx, userId);
      const current = await loadState(userId, tx);

      // An edit may leave the EIN blank to keep the one already on file.
      if (input.flow === "business" && !input.details.ein) {
        const previous = openOrNull(current.stored);
        if (previous?.flow === "business") {
          input = { ...input, details: { ...input.details, ein: previous.details.ein } };
        }
      }

      const lines = await tx
        .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
        .from(schema.phoneNumbers)
        .where(eq(schema.phoneNumbers.userId, userId));
      const problems = validateTextingRegistration(input, {
        blockedNumbers: lines.map((line) => line.phoneNumber),
      });
      if (problems.length > 0) {
        throw new AppError(
          400,
          "TEXTING_REGISTRATION_INVALID",
          "Some business details need a fix before they can be saved.",
          { problems },
        );
      }

      const next = sealTextingRegistration(input, current.stored);
      const envelope = { ...current.envelope, [TEXTING_REGISTRATION_PREFERENCE_KEY]: next };
      await tx
        .insert(schema.userPreferences)
        .values({ userId, preferences: envelope, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.userPreferences.userId,
          set: { preferences: envelope, updatedAt: new Date() },
        });
      // Texts open with this name, so it must match the brand carriers register.
      await tx
        .update(schema.settings)
        .set({ brandName: input.details.brandName, updatedAt: new Date() })
        .where(eq(schema.settings.userId, userId));
      await tx.insert(schema.auditLog).values({
        userId,
        action: "texting_registration.details_saved",
        eventType: "texting_registration.details_saved",
        severity: "info",
        resourceType: "texting_registration",
        metadata: { flow: next.flow, firstSubmission: !current.stored },
      });
      return current.stored ? null : next;
    });

    if (firstSubmission) void notifyFounder(userId, firstSubmission);
    res.json({ ok: true, ...payload(await loadState(userId)) });
  }),
);

router.delete(
  "/api/texting-registration",
  authenticateUser,
  userPreferencesRateLimit,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user.id;
    await drizzle.transaction(async (tx) => {
      await lockPreferenceEnvelope(tx, userId);
      const current = await loadState(userId, tx);
      if (!current.stored) return;
      const envelope = { ...current.envelope };
      delete envelope[TEXTING_REGISTRATION_PREFERENCE_KEY];
      await tx
        .update(schema.userPreferences)
        .set({ preferences: envelope, updatedAt: new Date() })
        .where(eq(schema.userPreferences.userId, userId));
      await tx.insert(schema.auditLog).values({
        userId,
        action: "texting_registration.details_removed",
        eventType: "texting_registration.details_removed",
        severity: "info",
        resourceType: "texting_registration",
        metadata: { flow: current.stored.flow },
      });
    });
    res.json({ ok: true, ...payload(await loadState(userId)) });
  }),
);

export default router;
