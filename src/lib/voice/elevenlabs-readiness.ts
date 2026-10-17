/** Operator-only account diagnostics. This module never enrolls or selects a voice. */
import { AppError } from "../api-error";
import { isPlatformAdmin } from "../../middleware/platform-admin";
import {
  createElevenLabsVoiceClient,
  ElevenLabsVoiceError,
  type ElevenLabsSubscriptionCapabilities,
} from "./elevenlabs-voice-client";

type Actor = { id?: string; email?: string };
type Configuration = {
  enabled: boolean;
  apiKey?: string;
  expectedWorkspaceId?: string;
};
type Client = Pick<ReturnType<typeof createElevenLabsVoiceClient>, "getAccountCapabilities">;
export type ElevenLabsReadinessDependencies = {
  isAdmin(actor: Actor): Promise<boolean>;
  configuration(): Configuration;
  client(apiKey: string): Client;
};

type SubscriptionSnapshot = Pick<
  ElevenLabsSubscriptionCapabilities,
  | "tier"
  | "status"
  | "canUseInstantVoiceCloning"
  | "canUseProfessionalVoiceCloning"
  | "characterCount"
  | "characterLimit"
  | "nextCharacterCountResetUnix"
  | "voiceSlotsUsed"
  | "voiceLimit"
  | "voiceAddEditCounter"
  | "maxVoiceAddEdits"
  | "canExtendCharacterLimit"
  | "maxCreditLimitExtension"
>;
type Failure =
  | "invalid_configuration"
  | "provider_rejected"
  | "provider_unavailable"
  | "invalid_response"
  | "interrupted";
export type ElevenLabsReadinessStatus = {
  enabled: boolean;
  configured: boolean;
  accountCheck: "not_run" | "succeeded" | "failed";
  accountFailure: Failure | null;
  workspaceBinding: "unconfigured" | "not_checked" | "matched" | "mismatch";
  subscription: SubscriptionSnapshot | null;
  /** Account reads prove none of the independent gates below. */
  enrollmentReady: false;
  liveCallsReady: false;
  endpointScopesVerified: false;
  usdFundingVerified: false;
};

const production: ElevenLabsReadinessDependencies = {
  isAdmin: isPlatformAdmin,
  configuration: () => ({
    enabled: process.env.BOTBOUND_ELEVENLABS_VOICE_ENABLED === "true",
    apiKey: process.env.BOTBOUND_ELEVENLABS_VOICE_API_KEY,
    expectedWorkspaceId: process.env.BOTBOUND_ELEVENLABS_WORKSPACE_ID,
  }),
  client: (apiKey) => createElevenLabsVoiceClient({ apiKey, timeoutMs: 10_000 }),
};

function failureCode(error: unknown): Failure {
  if (!(error instanceof ElevenLabsVoiceError)) return "provider_unavailable";
  switch (error.code) {
    case "INVALID_INPUT":
      return "invalid_configuration";
    case "PROVIDER_REJECTED":
      return "provider_rejected";
    case "INVALID_RESPONSE":
      return "invalid_response";
    case "ABORTED":
      return "interrupted";
    default:
      return "provider_unavailable";
  }
}

function snapshot(subscription: ElevenLabsSubscriptionCapabilities): SubscriptionSnapshot {
  // Explicit allowlist: do not spread a provider account or a growing DTO into HTTP output.
  return {
    tier: subscription.tier,
    status: subscription.status,
    canUseInstantVoiceCloning: subscription.canUseInstantVoiceCloning,
    canUseProfessionalVoiceCloning: subscription.canUseProfessionalVoiceCloning,
    characterCount: subscription.characterCount,
    characterLimit: subscription.characterLimit,
    nextCharacterCountResetUnix: subscription.nextCharacterCountResetUnix,
    voiceSlotsUsed: subscription.voiceSlotsUsed,
    voiceLimit: subscription.voiceLimit,
    voiceAddEditCounter: subscription.voiceAddEditCounter,
    maxVoiceAddEdits: subscription.maxVoiceAddEdits,
    canExtendCharacterLimit: subscription.canExtendCharacterLimit,
    maxCreditLimitExtension: subscription.maxCreditLimitExtension,
  };
}

export function createElevenLabsReadinessService(
  overrides: Partial<ElevenLabsReadinessDependencies> = {},
) {
  const deps = { ...production, ...overrides };
  return {
    async status(
      actor: Actor | undefined,
      signal?: AbortSignal,
    ): Promise<ElevenLabsReadinessStatus> {
      if (!actor?.id) throw AppError.unauthorized();
      let admin: boolean;
      try {
        admin = await deps.isAdmin(actor);
      } catch {
        throw AppError.serviceUnavailable("Operator authorization could not be confirmed.");
      }
      if (!admin) throw AppError.forbidden("Platform admin access required.");

      let config: Configuration;
      try {
        config = deps.configuration();
      } catch {
        throw AppError.serviceUnavailable("Voice provider configuration could not be checked.");
      }
      const enabled = config.enabled === true;
      const apiKey = config.apiKey?.trim() ?? "";
      const expected = config.expectedWorkspaceId?.trim() ?? "";
      const result: ElevenLabsReadinessStatus = {
        enabled,
        configured: Boolean(apiKey),
        accountCheck: "not_run",
        accountFailure: null,
        workspaceBinding: expected ? "not_checked" : "unconfigured",
        subscription: null,
        enrollmentReady: false,
        liveCallsReady: false,
        endpointScopesVerified: false,
        usdFundingVerified: false,
      };
      // The off switch prevents provider I/O, not just customer-facing controls.
      if (!enabled || !apiKey) return result;
      if (expected && !/^[A-Za-z0-9_-]{1,128}$/.test(expected))
        return { ...result, accountCheck: "failed", accountFailure: "invalid_configuration" };
      if (signal?.aborted)
        return { ...result, accountCheck: "failed", accountFailure: "interrupted" };
      try {
        const account = await deps.client(apiKey).getAccountCapabilities({ signal });
        if (signal?.aborted)
          return { ...result, accountCheck: "failed", accountFailure: "interrupted" };
        return {
          ...result,
          accountCheck: "succeeded",
          workspaceBinding: expected
            ? account.workspaceId === expected
              ? "matched"
              : "mismatch"
            : "unconfigured",
          subscription: snapshot(account.subscription),
        };
      } catch (error) {
        return { ...result, accountCheck: "failed", accountFailure: failureCode(error) };
      }
    },
  };
}

export const elevenLabsReadinessService = createElevenLabsReadinessService();
