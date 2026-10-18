/** Operator-only account diagnostics. This module never enrolls or selects a voice. */
import { AppError } from "../api-error";
import { isPlatformAdmin } from "../../middleware/platform-admin";
import {
  recordElevenLabsReadinessReceipt,
  type ElevenLabsReadinessReceipt,
} from "./elevenlabs-readiness-receipt";
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
type Client = Pick<
  ReturnType<typeof createElevenLabsVoiceClient>,
  "getAccountCapabilities" | "listVoices"
>;
export type ElevenLabsReadinessDependencies = {
  isAdmin(actor: Actor): Promise<boolean>;
  configuration(): Configuration;
  client(apiKey: string): Client;
  receipt(userId: string, status: ElevenLabsReadinessStatus): Promise<ElevenLabsReadinessReceipt>;
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
export type ElevenLabsReadinessBlocker =
  | "credential_missing"
  | "account_read_unverified"
  | "workspace_binding_required"
  | "workspace_binding_unverified"
  | "workspace_mismatch"
  | "voices_read_unverified"
  | "subscription_not_active"
  | "instant_cloning_unavailable"
  | "workspace_credits_exhausted"
  | "workspace_voice_slots_exhausted"
  | "workspace_voice_edits_exhausted"
  | "workspace_voice_edits_unknown"
  | "restricted_key_cap_unverified"
  | "mutation_scopes_unverified"
  | "usd_funding_unverified"
  | "customer_saas_rights_unverified"
  | "enrollment_not_ready"
  | "live_calls_not_ready";
export type ElevenLabsReadinessStatus = {
  enabled: boolean;
  configured: boolean;
  accountCheck: "not_run" | "succeeded" | "failed";
  accountFailure: Failure | null;
  workspaceBinding: "unconfigured" | "not_checked" | "matched" | "mismatch";
  subscription: SubscriptionSnapshot | null;
  /** This proves only a GET permission, never ownership of a listed voice. */
  voicesReadCheck: "not_run" | "succeeded" | "failed";
  voicesReadFailure: Failure | null;
  /** Workspace counters do not reveal the staged restricted key's own limit. */
  capacity: {
    workspaceCreditsRemaining: number;
    workspaceVoiceSlotsRemaining: number;
    workspaceVoiceAddEditsRemaining: number | null;
    restrictedKeyCreditsRemaining: null;
  } | null;
  blockers: ElevenLabsReadinessBlocker[];
  /** Account reads prove none of the independent gates below. */
  enrollmentReady: false;
  liveCallsReady: false;
  endpointScopesVerified: false;
  usdFundingVerified: false;
  customerSaasRightsVerified: false;
};

const production: ElevenLabsReadinessDependencies = {
  isAdmin: isPlatformAdmin,
  configuration: () => ({
    enabled: process.env.BOTBOUND_ELEVENLABS_VOICE_ENABLED === "true",
    apiKey: process.env.BOTBOUND_ELEVENLABS_VOICE_API_KEY,
    expectedWorkspaceId: process.env.BOTBOUND_ELEVENLABS_WORKSPACE_ID,
  }),
  client: (apiKey) => createElevenLabsVoiceClient({ apiKey, timeoutMs: 10_000 }),
  receipt: recordElevenLabsReadinessReceipt,
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

function describe(result: ElevenLabsReadinessStatus): ElevenLabsReadinessStatus {
  const blockers: ElevenLabsReadinessBlocker[] = [];
  if (!result.configured) blockers.push("credential_missing");
  if (result.accountCheck !== "succeeded") blockers.push("account_read_unverified");
  if (result.workspaceBinding === "unconfigured") blockers.push("workspace_binding_required");
  if (result.workspaceBinding === "not_checked") blockers.push("workspace_binding_unverified");
  if (result.workspaceBinding === "mismatch") blockers.push("workspace_mismatch");
  if (result.voicesReadCheck !== "succeeded") blockers.push("voices_read_unverified");
  const subscription = result.subscription;
  if (subscription) {
    if (subscription.status !== "active") blockers.push("subscription_not_active");
    if (!subscription.canUseInstantVoiceCloning) blockers.push("instant_cloning_unavailable");
    result.capacity = {
      workspaceCreditsRemaining: Math.max(
        0,
        subscription.characterLimit - subscription.characterCount,
      ),
      workspaceVoiceSlotsRemaining: Math.max(
        0,
        subscription.voiceLimit - subscription.voiceSlotsUsed,
      ),
      workspaceVoiceAddEditsRemaining:
        subscription.maxVoiceAddEdits === null
          ? null
          : Math.max(0, subscription.maxVoiceAddEdits - subscription.voiceAddEditCounter),
      restrictedKeyCreditsRemaining: null,
    };
    // Do not count optional paid overages or extension entitlements as purchased headroom.
    if (result.capacity.workspaceCreditsRemaining === 0)
      blockers.push("workspace_credits_exhausted");
    if (result.capacity.workspaceVoiceSlotsRemaining === 0)
      blockers.push("workspace_voice_slots_exhausted");
    if (result.capacity.workspaceVoiceAddEditsRemaining === null)
      blockers.push("workspace_voice_edits_unknown");
    else if (result.capacity.workspaceVoiceAddEditsRemaining === 0)
      blockers.push("workspace_voice_edits_exhausted");
  }
  blockers.push(
    "restricted_key_cap_unverified",
    "mutation_scopes_unverified",
    "usd_funding_unverified",
    "customer_saas_rights_unverified",
    "enrollment_not_ready",
    "live_calls_not_ready",
  );
  return { ...result, blockers };
}

export function createElevenLabsReadinessService(
  overrides: Partial<ElevenLabsReadinessDependencies> = {},
) {
  const deps = { ...production, ...overrides };
  async function status(
    actor: Actor | undefined,
    signal?: AbortSignal,
    explicitReadOnlyVerification = false,
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
      voicesReadCheck: "not_run",
      voicesReadFailure: null,
      capacity: null,
      blockers: [],
      enrollmentReady: false,
      liveCallsReady: false,
      endpointScopesVerified: false,
      usdFundingVerified: false,
      customerSaasRightsVerified: false,
    };
    // Passive status honors the off switch. A separate explicit admin action
    // can inspect the staged credential without enabling any voice feature.
    if ((!enabled && !explicitReadOnlyVerification) || !apiKey) return describe(result);
    if (expected && !/^[A-Za-z0-9_-]{1,128}$/.test(expected))
      return describe({
        ...result,
        accountCheck: "failed",
        accountFailure: "invalid_configuration",
      });
    if (signal?.aborted)
      return describe({ ...result, accountCheck: "failed", accountFailure: "interrupted" });
    try {
      const client = deps.client(apiKey);
      const account = await client.getAccountCapabilities({ signal });
      if (signal?.aborted)
        return describe({ ...result, accountCheck: "failed", accountFailure: "interrupted" });
      const checked: ElevenLabsReadinessStatus = {
        ...result,
        accountCheck: "succeeded",
        workspaceBinding: expected
          ? account.workspaceId === expected
            ? "matched"
            : "mismatch"
          : "unconfigured",
        subscription: snapshot(account.subscription),
      };
      // Never enumerate a credential's unbound or unexpected workspace.
      if (checked.workspaceBinding === "matched") {
        try {
          // A single bounded read proves only this endpoint's read permission.
          // Discard names, IDs, pagination tokens and all provider voice rows.
          await client.listVoices({ pageSize: 1 }, { signal });
          checked.voicesReadCheck = signal?.aborted ? "failed" : "succeeded";
          checked.voicesReadFailure = signal?.aborted ? "interrupted" : null;
        } catch (error) {
          checked.voicesReadCheck = "failed";
          checked.voicesReadFailure = failureCode(error);
        }
      }
      return describe(checked);
    } catch (error) {
      return describe({ ...result, accountCheck: "failed", accountFailure: failureCode(error) });
    }
  }

  return {
    status: (actor: Actor | undefined, signal?: AbortSignal) => status(actor, signal),
    async verify(actor: Actor | undefined, signal?: AbortSignal) {
      if (!actor?.id) throw AppError.unauthorized();
      const checked = await status(actor, signal, true);
      if (signal?.aborted) throw AppError.serviceUnavailable("The provider check was interrupted.");
      try {
        const receipt = await deps.receipt(actor.id, checked);
        return { ...checked, receipt };
      } catch {
        // Do not claim a completed verification when durable evidence was not saved.
        throw AppError.serviceUnavailable(
          "The provider check receipt could not be saved. Try again.",
        );
      }
    },
  };
}

export const elevenLabsReadinessService = createElevenLabsReadinessService();
