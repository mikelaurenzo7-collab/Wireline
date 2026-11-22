import {
  BUSINESS_INDUSTRIES,
  BUSINESS_TYPES,
  JOB_POSITIONS,
  normalizeEin,
  SOLE_PROPRIETOR_VERTICALS,
  validateBusinessDetails,
  validateSoleProprietorDetails,
  type CustomerBusinessDetails,
  type SoleProprietorDetails,
} from "./carrier-registration";
import { decryptSecret, encryptSecret } from "./secret-vault";

/**
 * The business details an owner gives so US carriers can approve texting from
 * their line. Stored in `preferences.texting_registration`, sealed with the
 * application data key (AES-256-GCM, `secret-vault.ts`) because it holds an
 * EIN and a person's contact details. Only a display summary is kept in the
 * clear. The general preferences API never returns or replaces this namespace
 * (`server-owned-preferences.ts`); `carrier:register --workspace` opens it.
 *
 * One flow per workspace: `business` (an EIN, Low-Volume Standard brand) or
 * `sole_proprietor` (no EIN; the owner confirms by replying YES to a carrier
 * text).
 */

export const TEXTING_REGISTRATION_PREFERENCE_KEY = "texting_registration";
export const TEXTING_REGISTRATION_FLOWS = ["business", "sole_proprietor"] as const;
export type TextingRegistrationFlow = (typeof TEXTING_REGISTRATION_FLOWS)[number];

export type TextingRegistrationInput =
  | { flow: "business"; details: CustomerBusinessDetails }
  | { flow: "sole_proprietor"; details: SoleProprietorDetails };

export type TextingRegistrationSummary = {
  brandName: string;
  /** Legal business name, or the owner's full name for a sole proprietor. */
  businessName: string;
  contactName: string;
  einLastFour: string | null;
  city: string;
  region: string;
};

export type StoredTextingRegistration = {
  version: 1;
  flow: TextingRegistrationFlow;
  sealed: string;
  summary: TextingRegistrationSummary;
  submittedAt: string;
  updatedAt: string;
};

/** Choices the form offers; the server validates against the same lists. */
export const TEXTING_REGISTRATION_OPTIONS = {
  businessTypes: BUSINESS_TYPES.filter((type) => type !== "Sole Proprietorship"),
  industries: BUSINESS_INDUSTRIES,
  verticals: SOLE_PROPRIETOR_VERTICALS,
  jobPositions: JOB_POSITIONS,
};

const MAX_TEXT = 120;

function text(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** "(312) 555-0100", "312-555-0100" and "+1 312 555 0100" all become "+13125550100". */
export function normalizeUsPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return text(value, 20);
}

function normalizeUrl(value: unknown): string {
  const raw = text(value, 300);
  if (!raw) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function normalizeAddress(value: unknown): CustomerBusinessDetails["address"] {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    street: text(raw.street, 200),
    city: text(raw.city),
    region: text(raw.region, 2).toUpperCase(),
    postalCode: text(raw.postalCode, 10),
  };
}

/** Trim and shape whatever the form sent. Validation happens separately so every problem shows at once. */
export function normalizeTextingRegistrationInput(body: unknown): TextingRegistrationInput {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const details =
    raw.details && typeof raw.details === "object" ? (raw.details as Record<string, unknown>) : {};
  if (raw.flow === "sole_proprietor") {
    return {
      flow: "sole_proprietor",
      details: {
        brandName: text(details.brandName, 60),
        firstName: text(details.firstName),
        lastName: text(details.lastName),
        email: text(details.email, 254).toLowerCase(),
        mobilePhone: normalizeUsPhone(details.mobilePhone),
        vertical: text(details.vertical, 40) as SoleProprietorDetails["vertical"],
        address: normalizeAddress(details.address),
        websiteUrl: normalizeUrl(details.websiteUrl) || undefined,
      },
    };
  }
  const rep =
    details.representative && typeof details.representative === "object"
      ? (details.representative as Record<string, unknown>)
      : {};
  return {
    flow: "business",
    details: {
      legalName: text(details.legalName),
      brandName: text(details.brandName, 60),
      businessType: text(details.businessType, 60) as CustomerBusinessDetails["businessType"],
      industry: text(details.industry, 40) as CustomerBusinessDetails["industry"],
      ein: normalizeEin(text(details.ein, 20)),
      websiteUrl: normalizeUrl(details.websiteUrl),
      privacyUrl: normalizeUrl(details.privacyUrl),
      termsUrl: normalizeUrl(details.termsUrl),
      address: normalizeAddress(details.address),
      representative: {
        firstName: text(rep.firstName),
        lastName: text(rep.lastName),
        email: text(rep.email, 254).toLowerCase(),
        phone: normalizeUsPhone(rep.phone),
        businessTitle: text(rep.businessTitle),
        jobPosition: text(
          rep.jobPosition,
          40,
        ) as CustomerBusinessDetails["representative"]["jobPosition"],
      },
    },
  };
}

export function validateTextingRegistration(
  input: TextingRegistrationInput,
  options: { blockedNumbers?: readonly string[] } = {},
): string[] {
  if (input.flow === "sole_proprietor")
    return validateSoleProprietorDetails(input.details, options);
  const errors = validateBusinessDetails(input.details);
  const repPhone = input.details.representative.phone;
  if (options.blockedNumbers?.includes(repPhone))
    errors.push("Use the representative's own phone, not a BotBound line.");
  return errors;
}

export function summarizeTextingRegistration(
  input: TextingRegistrationInput,
): TextingRegistrationSummary {
  if (input.flow === "sole_proprietor") {
    const name = `${input.details.firstName} ${input.details.lastName}`.trim();
    return {
      brandName: input.details.brandName,
      businessName: name,
      contactName: name,
      einLastFour: null,
      city: input.details.address.city,
      region: input.details.address.region,
    };
  }
  const rep = input.details.representative;
  return {
    brandName: input.details.brandName,
    businessName: input.details.legalName,
    contactName: `${rep.firstName} ${rep.lastName}`.trim(),
    einLastFour: input.details.ein.slice(-4) || null,
    city: input.details.address.city,
    region: input.details.address.region,
  };
}

/** Seal validated details. Throws when the data key is not configured; never stores plaintext. */
export function sealTextingRegistration(
  input: TextingRegistrationInput,
  previous: StoredTextingRegistration | null,
  now: Date = new Date(),
): StoredTextingRegistration {
  return {
    version: 1,
    flow: input.flow,
    sealed: encryptSecret(JSON.stringify(input.details)),
    summary: summarizeTextingRegistration(input),
    submittedAt: previous?.submittedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function readStoredTextingRegistration(
  preferences: unknown,
): StoredTextingRegistration | null {
  const envelope =
    preferences && typeof preferences === "object" && !Array.isArray(preferences)
      ? (preferences as Record<string, unknown>)
      : {};
  const raw = envelope[TEXTING_REGISTRATION_PREFERENCE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stored = raw as Partial<StoredTextingRegistration>;
  if (
    stored.version !== 1 ||
    !TEXTING_REGISTRATION_FLOWS.includes(stored.flow as TextingRegistrationFlow) ||
    typeof stored.sealed !== "string" ||
    !stored.summary ||
    typeof stored.submittedAt !== "string"
  ) {
    return null;
  }
  return stored as StoredTextingRegistration;
}

/** Decrypt the details. Server and founder CLI only; throws when the data key is wrong or absent. */
export function openTextingRegistration(
  stored: StoredTextingRegistration,
): TextingRegistrationInput {
  const details = JSON.parse(decryptSecret(stored.sealed)) as unknown;
  return normalizeTextingRegistrationInput({ flow: stored.flow, details });
}

/**
 * The details an owner may see again to edit them: everything they entered
 * except the EIN, which shows only as its last four digits.
 */
export function editableTextingRegistration(
  input: TextingRegistrationInput,
): Record<string, unknown> {
  if (input.flow === "sole_proprietor") return { ...input.details };
  return { ...input.details, ein: "" };
}
