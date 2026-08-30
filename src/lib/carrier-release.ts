export type CarrierReleaseKind = "twilio_sid" | "e164";

export interface CarrierReleaseInput {
  kind: CarrierReleaseKind;
  phoneNumber: string;
  carrierId?: string | null;
}

export interface CarrierReleaseAdapters {
  twilioAvailable: boolean;
  releaseTwilioBySid: (twilioSid: string) => Promise<void>;
  releaseTwilioByE164: (phoneNumber: string) => Promise<void>;
}

export interface CarrierReleaseResult {
  ok: boolean;
  error?: string;
}

function errorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" ? (error as Record<string, unknown>) : {};
}

function releaseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Treat provider-confirmed absence as success so reconciliation is retry-safe. */
export function isCarrierAlreadyReleasedError(error: unknown): boolean {
  const row = errorRecord(error);
  const raw = errorRecord(row.raw);
  const statusCode = Number(row.statusCode ?? row.status ?? raw.statusCode ?? raw.status ?? 0);
  const code = String(row.code ?? raw.code ?? "").toLowerCase();
  const message = releaseErrorMessage(error).toLowerCase();
  return (
    statusCode === 404 ||
    code === "20404" ||
    code === "resource_missing" ||
    /\btwilio\s*404\b/.test(message) ||
    /(?:resource|phone number).*(?:missing|not found)/.test(message)
  );
}

async function attemptRelease(
  label: string,
  action: () => Promise<void>,
  errors: string[],
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isCarrierAlreadyReleasedError(error)) return;
    errors.push(`${label}: ${releaseErrorMessage(error)}`);
  }
}

/** Release the Twilio allocation represented by one canonical phone row. */
export async function releaseCarrierAllocations(
  input: CarrierReleaseInput,
  adapters: CarrierReleaseAdapters,
): Promise<CarrierReleaseResult> {
  if (!adapters.twilioAvailable) {
    return { ok: false, error: "Twilio cleanup could not run because the client is unavailable." };
  }

  const errors: string[] = [];
  if (input.kind === "twilio_sid") {
    if (!input.carrierId) return { ok: false, error: "Twilio number SID is missing." };
    await attemptRelease(
      "Twilio SID release",
      () => adapters.releaseTwilioBySid(input.carrierId as string),
      errors,
    );
  } else {
    await attemptRelease(
      "Twilio E.164 release",
      () => adapters.releaseTwilioByE164(input.phoneNumber),
      errors,
    );
  }

  return errors.length ? { ok: false, error: errors.join(" | ") } : { ok: true };
}
