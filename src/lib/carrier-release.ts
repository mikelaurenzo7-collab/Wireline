export type CarrierReleaseKind = "vapi" | "twilio_sid" | "e164";

export interface CarrierReleaseInput {
  kind: CarrierReleaseKind;
  phoneNumber: string;
  carrierId?: string | null;
}

export interface CarrierReleaseAdapters {
  twilioAvailable: boolean;
  inspectVapiProvider: (vapiNumberId: string) => Promise<string | null>;
  releaseVapi: (vapiNumberId: string) => Promise<void>;
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

/**
 * Carrier DELETE operations are retry-safe when the provider says the resource
 * no longer exists. Everything else must remain visible to the caller so local
 * ownership identifiers are not erased while a billable allocation may remain.
 */
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
    /\b(?:vapi|twilio)?\s*404\b/.test(message) ||
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

/**
 * Release every provider allocation represented by one canonical phone row.
 *
 * Twilio-backed Vapi imports store the Vapi UUID, not the Twilio SID. When a
 * Twilio client is available, the E.164 cleanup therefore runs after every Vapi
 * release; it is a safe no-op for Vapi-managed numbers and closes the hidden
 * Twilio rental for imported numbers. Any non-idempotent provider failure keeps
 * the caller from deleting the local row.
 */
export async function releaseCarrierAllocations(
  input: CarrierReleaseInput,
  adapters: CarrierReleaseAdapters,
): Promise<CarrierReleaseResult> {
  const errors: string[] = [];

  if (input.kind === "vapi") {
    const vapiNumberId = input.carrierId;
    if (!vapiNumberId) return { ok: false, error: "Vapi number id is missing." };

    if (!adapters.twilioAvailable) {
      let provider: string | null;
      try {
        provider = (await adapters.inspectVapiProvider(vapiNumberId))?.trim().toLowerCase() || null;
      } catch (error) {
        if (isCarrierAlreadyReleasedError(error)) return { ok: true };
        return {
          ok: false,
          error: `Vapi provider inspection: ${releaseErrorMessage(error)}`,
        };
      }

      // A successful inspection with no matching provider means the Vapi object
      // is already gone. Treat that terminal state like a provider 404.
      if (!provider) return { ok: true };

      // Keep the Vapi object intact when Twilio cleanup cannot run. Its provider
      // metadata is the evidence a later retry needs to finish both allocations.
      if (provider === "twilio") {
        return {
          ok: false,
          error:
            "Twilio cleanup could not run because the Vapi number is Twilio-managed and the Twilio client is unavailable.",
        };
      }
      if (provider !== "vapi") {
        return {
          ok: false,
          error: `Vapi provider "${provider}" is not recognized; carrier cleanup was not attempted.`,
        };
      }

      await attemptRelease("Vapi release", () => adapters.releaseVapi(vapiNumberId), errors);
    } else {
      await attemptRelease("Vapi release", () => adapters.releaseVapi(vapiNumberId), errors);
      await attemptRelease(
        "Twilio E.164 release",
        () => adapters.releaseTwilioByE164(input.phoneNumber),
        errors,
      );
    }
  } else if (input.kind === "twilio_sid") {
    if (!input.carrierId) return { ok: false, error: "Twilio number SID is missing." };
    if (!adapters.twilioAvailable) {
      errors.push("Twilio cleanup could not run because the Twilio client is unavailable.");
    } else {
      await attemptRelease(
        "Twilio SID release",
        () => adapters.releaseTwilioBySid(input.carrierId as string),
        errors,
      );
    }
  } else if (!adapters.twilioAvailable) {
    errors.push("No carrier release path is configured for this phone number.");
  } else {
    await attemptRelease(
      "Twilio E.164 release",
      () => adapters.releaseTwilioByE164(input.phoneNumber),
      errors,
    );
  }

  return errors.length ? { ok: false, error: errors.join(" | ") } : { ok: true };
}
