import { Router, type Response } from "express";
import { desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import {
  buildCompanyIdentityProfile,
  buildCompanyIdentityReadiness,
  canRequestCompanyIdentityReview,
  COMPANY_IDENTITY_CHANNELS,
  companyIdentityFingerprint,
  type CompanyIdentityChannel,
  type CompanyIdentityPreferences,
  defaultCompanyIdentityPreferences,
  readCompanyIdentityPreferences,
} from "../lib/company-identity";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { userPreferencesRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

type PreferenceEnvelope = Record<string, unknown>;

function asPreferenceEnvelope(value: unknown): PreferenceEnvelope {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as PreferenceEnvelope) }
    : {};
}

function nullableText(value: unknown, field: string, maxLength: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw AppError.fromHttpStatus(400, `${field} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw AppError.fromHttpStatus(400, `${field} must be ${maxLength} characters or fewer.`);
  }
  return normalized;
}

function httpsUrl(value: unknown, field: string): string | null | undefined {
  const normalized = nullableText(value, field, 500);
  if (!normalized) return normalized;
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") throw new Error("https required");
    return parsed.toString();
  } catch {
    throw AppError.fromHttpStatus(400, `${field} must be a valid HTTPS URL.`);
  }
}

function supportEmail(value: unknown): string | null | undefined {
  const normalized = nullableText(value, "Support email", 254);
  if (!normalized) return normalized;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw AppError.fromHttpStatus(400, "Support email must be valid.");
  }
  return normalized.toLowerCase();
}

function callerIdName(value: unknown): string | null | undefined {
  const normalized = nullableText(value, "Caller ID fallback name", 15);
  if (!normalized) return normalized;
  const upper = normalized.toUpperCase();
  if (!/^[A-Z0-9 .,'&-]+$/.test(upper)) {
    throw AppError.fromHttpStatus(
      400,
      "Caller ID fallback name may contain letters, numbers, spaces, and basic punctuation only.",
    );
  }
  return upper;
}

function requestedChannels(value: unknown): CompanyIdentityChannel[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw AppError.fromHttpStatus(400, "requested_channels must be an array.");
  }
  const channels = value.filter((channel): channel is CompanyIdentityChannel =>
    COMPANY_IDENTITY_CHANNELS.includes(channel as CompanyIdentityChannel),
  );
  if (channels.length !== value.length) {
    throw AppError.fromHttpStatus(400, "requested_channels contains an unsupported channel.");
  }
  return [...new Set(channels)];
}

function fingerprintProfile(profile: {
  businessName: string | null;
  brandName: string | null;
  logoUrl: string | null;
  callerIdName: string | null;
  website: string | null;
  supportEmail: string | null;
  defaultCallReason: string | null;
  requestedChannels: CompanyIdentityChannel[];
}): string {
  return companyIdentityFingerprint(profile);
}

async function loadIdentityState(userId: string) {
  const [[settingsRow], [preferencesRow], [phoneRow]] = await Promise.all([
    drizzle
      .select({
        businessName: schema.settings.businessName,
        brandName: schema.settings.brandName,
        brandLogoUrl: schema.settings.brandLogoUrl,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1),
    drizzle
      .select({ preferences: schema.userPreferences.preferences })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1),
    drizzle
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, userId))
      .orderBy(desc(schema.phoneNumbers.createdAt))
      .limit(1),
  ]);

  const envelope = asPreferenceEnvelope(preferencesRow?.preferences);
  const storedPreferences = readCompanyIdentityPreferences(envelope.company_identity);
  const storedProfile = buildCompanyIdentityProfile({ settings: settingsRow, preferences: storedPreferences });
  const currentFingerprint = fingerprintProfile(storedProfile);
  const hasReviewState =
    Boolean(storedPreferences.reviewRequestedAt) ||
    Object.values(storedPreferences.providerStatus).some((status) => status !== "not_requested");
  const staleReviewState =
    hasReviewState && storedPreferences.reviewFingerprint !== currentFingerprint;
  const preferences: CompanyIdentityPreferences = staleReviewState
    ? {
        ...storedPreferences,
        reviewRequestedAt: null,
        reviewFingerprint: null,
        providerStatus: defaultCompanyIdentityPreferences().providerStatus,
      }
    : storedPreferences;
  const profile = buildCompanyIdentityProfile({ settings: settingsRow, preferences });
  const readiness = buildCompanyIdentityReadiness({
    profile,
    phoneNumber: phoneRow?.phoneNumber ?? null,
  });

  return {
    envelope,
    preferences,
    profile,
    readiness,
    phoneNumber: phoneRow?.phoneNumber ?? null,
    currentFingerprint,
    staleReviewState,
  };
}

function publicPayload(state: Awaited<ReturnType<typeof loadIdentityState>>) {
  return {
    profile: {
      business_name: state.profile.businessName,
      brand_name: state.profile.brandName,
      logo_url: state.profile.logoUrl,
      caller_id_name: state.profile.callerIdName,
      website: state.profile.website,
      support_email: state.profile.supportEmail,
      default_call_reason: state.profile.defaultCallReason,
      requested_channels: state.profile.requestedChannels,
      review_requested_at: state.profile.reviewRequestedAt,
    },
    phone_number: state.phoneNumber,
    channels: {
      voice: {
        profile_status: state.readiness.voice.profileStatus,
        provider_status: state.readiness.voice.providerStatus,
        missing: state.readiness.voice.missing,
        display_scope: state.readiness.voice.displayScope,
      },
      sms: {
        profile_status: state.readiness.sms.profileStatus,
        provider_status: state.readiness.sms.providerStatus,
        missing: state.readiness.sms.missing,
        display_scope: state.readiness.sms.displayScope,
      },
      email: {
        profile_status: state.readiness.email.profileStatus,
        provider_status: state.readiness.email.providerStatus,
        missing: state.readiness.email.missing,
        display_scope: state.readiness.email.displayScope,
      },
    },
    review_eligible: canRequestCompanyIdentityReview({
      readiness: state.readiness,
      requestedChannels: state.profile.requestedChannels,
    }),
    review_state_invalidated: state.staleReviewState,
    guarantee:
      "Wireline can submit a verified business identity to supported providers. Final display, coverage, timing, and approval remain controlled by carriers, devices, and inbox providers.",
  };
}

router.get(
  "/api/company-identity",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      res.json(publicPayload(await loadIdentityState(req.user.id)));
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("company identity load failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(503, "Company identity is temporarily unavailable.");
    }
  },
);

router.post(
  "/api/company-identity",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const current = await loadIdentityState(req.user.id);
      const businessName = nullableText(req.body?.business_name, "Business name", 120);
      const brandName = nullableText(req.body?.brand_name, "Brand name", 80);
      const logoUrl = httpsUrl(req.body?.logo_url, "Logo URL");
      const nextCallerIdName = callerIdName(req.body?.caller_id_name);
      const website = httpsUrl(req.body?.website, "Website");
      const nextSupportEmail = supportEmail(req.body?.support_email);
      const defaultCallReason = nullableText(
        req.body?.default_call_reason,
        "Default call reason",
        64,
      );
      const nextRequestedChannels = requestedChannels(req.body?.requested_channels);

      const nextBusinessName =
        businessName === undefined ? current.profile.businessName : businessName;
      const nextBrandName = brandName === undefined ? current.profile.brandName : brandName;
      const nextLogoUrl = logoUrl === undefined ? current.profile.logoUrl : logoUrl;
      const nextIdentityValues = {
        businessName: nextBusinessName,
        brandName: nextBrandName,
        logoUrl: nextLogoUrl,
        callerIdName:
          nextCallerIdName === undefined ? current.preferences.callerIdName : nextCallerIdName,
        website: website === undefined ? current.preferences.website : website,
        supportEmail:
          nextSupportEmail === undefined ? current.preferences.supportEmail : nextSupportEmail,
        defaultCallReason:
          defaultCallReason === undefined
            ? current.preferences.defaultCallReason
            : defaultCallReason,
        requestedChannels: nextRequestedChannels ?? current.preferences.requestedChannels,
      };
      const nextFingerprint = fingerprintProfile(nextIdentityValues);
      const profileChanged = current.currentFingerprint !== nextFingerprint;

      const nextPreferences: CompanyIdentityPreferences = {
        ...current.preferences,
        callerIdName: nextIdentityValues.callerIdName,
        website: nextIdentityValues.website,
        supportEmail: nextIdentityValues.supportEmail,
        defaultCallReason: nextIdentityValues.defaultCallReason,
        requestedChannels: nextIdentityValues.requestedChannels,
        reviewRequestedAt: profileChanged ? null : current.preferences.reviewRequestedAt,
        reviewFingerprint: profileChanged ? null : current.preferences.reviewFingerprint,
        providerStatus: profileChanged
          ? defaultCompanyIdentityPreferences().providerStatus
          : current.preferences.providerStatus,
      };
      const nextEnvelope = {
        ...current.envelope,
        company_identity: nextPreferences,
      };

      await drizzle.transaction(async (tx) => {
        await tx
          .insert(schema.settings)
          .values({
            id: req.user.id,
            userId: req.user.id,
            businessName: nextBusinessName,
            brandName: nextBrandName,
            brandLogoUrl: nextLogoUrl,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.settings.userId,
            set: {
              businessName: nextBusinessName,
              brandName: nextBrandName,
              brandLogoUrl: nextLogoUrl,
              updatedAt: new Date(),
            },
          });
        await tx
          .insert(schema.userPreferences)
          .values({
            userId: req.user.id,
            preferences: nextEnvelope,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.userPreferences.userId,
            set: { preferences: nextEnvelope, updatedAt: new Date() },
          });
        if (profileChanged || current.staleReviewState) {
          await tx.insert(schema.auditLog).values({
            userId: req.user.id,
            action: "company_identity.profile_updated",
            eventType: "company_identity.profile_updated",
            severity: "info",
            resourceType: "company_identity",
            metadata: {
              channels: nextIdentityValues.requestedChannels,
              priorReviewInvalidated:
                current.staleReviewState || Boolean(current.preferences.reviewRequestedAt),
            },
          });
        }
      });

      res.json({
        ok: true,
        profile_changed: profileChanged,
        ...publicPayload(await loadIdentityState(req.user.id)),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("company identity save failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not save company identity.");
    }
  },
);

router.post(
  "/api/company-identity/review-request",
  authenticateUser,
  userPreferencesRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const current = await loadIdentityState(req.user.id);
      if (
        !canRequestCompanyIdentityReview({
          readiness: current.readiness,
          requestedChannels: current.profile.requestedChannels,
        })
      ) {
        return res.status(409).json({
          code: "IDENTITY_PROFILE_INCOMPLETE",
          error: "Complete every selected channel's company identity requirements first.",
          channels: publicPayload(current).channels,
        });
      }

      const requestedAt = new Date().toISOString();
      const providerStatus = { ...current.preferences.providerStatus };
      for (const channel of current.profile.requestedChannels) {
        providerStatus[channel] = "review_requested";
      }
      const nextPreferences: CompanyIdentityPreferences = {
        ...current.preferences,
        reviewRequestedAt: requestedAt,
        reviewFingerprint: current.currentFingerprint,
        providerStatus,
      };
      const nextEnvelope = {
        ...current.envelope,
        company_identity: nextPreferences,
      };

      await drizzle.transaction(async (tx) => {
        await tx
          .insert(schema.userPreferences)
          .values({
            userId: req.user.id,
            preferences: nextEnvelope,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.userPreferences.userId,
            set: { preferences: nextEnvelope, updatedAt: new Date() },
          });
        await tx.insert(schema.auditLog).values({
          userId: req.user.id,
          action: "company_identity.review_requested",
          eventType: "company_identity.review_requested",
          severity: "info",
          resourceType: "company_identity",
          metadata: {
            channels: current.profile.requestedChannels,
            hasNumber: Boolean(current.phoneNumber),
            hasLogo: Boolean(current.profile.logoUrl),
            requestedAt,
            profileFingerprint: current.currentFingerprint,
          },
        });
      });

      res.status(202).json({
        ok: true,
        message:
          "Verification review requested. Wireline will submit eligible assets to supported providers; approval and display coverage are not guaranteed.",
        ...publicPayload(await loadIdentityState(req.user.id)),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("company identity review request failed", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not request company identity review.");
    }
  },
);

export default router;
