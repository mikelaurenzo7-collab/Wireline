/** Durable operator evidence only. No speaker, provider resource or credential is stored. */
import { randomUUID } from "node:crypto";

import { auditLog } from "../../db/schema";
import { drizzle, tenantStore } from "../server-context";
import { deploymentSourceCommit } from "../deployment-environment";
import type { ElevenLabsReadinessStatus } from "./elevenlabs-readiness";

export type ElevenLabsReadinessReceipt = {
  id: string;
  checkedAt: string;
  sourceCommit: string | null;
  stored: true;
};

export function elevenLabsReadinessReceiptMetadata(
  status: ElevenLabsReadinessStatus,
  receipt: Omit<ElevenLabsReadinessReceipt, "stored">,
) {
  // Explicit allowlist. Never spread a provider result, status DTO or actor.
  return {
    version: "elevenlabs-read-only-readiness-v1-2026-10-17",
    mode: "read_only",
    checked_at: receipt.checkedAt,
    source_commit: receipt.sourceCommit,
    feature_enabled: status.enabled,
    credential_configured: status.configured,
    account_check: status.accountCheck,
    account_failure: status.accountFailure,
    workspace_binding: status.workspaceBinding,
    voices_read_check: status.voicesReadCheck,
    voices_read_failure: status.voicesReadFailure,
    subscription: status.subscription
      ? {
          tier: status.subscription.tier,
          status: status.subscription.status,
          instant_cloning_capability: status.subscription.canUseInstantVoiceCloning,
          professional_cloning_capability: status.subscription.canUseProfessionalVoiceCloning,
        }
      : null,
    workspace_capacity: status.capacity
      ? {
          credits_remaining: status.capacity.workspaceCreditsRemaining,
          voice_slots_remaining: status.capacity.workspaceVoiceSlotsRemaining,
          voice_add_edits_remaining: status.capacity.workspaceVoiceAddEditsRemaining,
        }
      : null,
    restricted_key_cap_verified: false,
    mutation_scopes_verified: false,
    usd_funding_verified: false,
    customer_saas_rights_verified: false,
    enrollment_ready: false,
    live_calls_ready: false,
    blockers: [...status.blockers],
  };
}

export async function recordElevenLabsReadinessReceipt(
  userId: string,
  status: ElevenLabsReadinessStatus,
): Promise<ElevenLabsReadinessReceipt> {
  const receipt = {
    id: randomUUID(),
    checkedAt: new Date().toISOString(),
    sourceCommit: deploymentSourceCommit(),
  };
  await tenantStore.run(userId, async () => {
    await drizzle.insert(auditLog).values({
      userId,
      action: "voice.elevenlabs.readiness.checked",
      provider: "elevenlabs",
      eventType: "voice.elevenlabs.readiness.checked",
      resourceType: "voice_provider_readiness",
      resourceId: receipt.id,
      costUsd: "0",
      metadata: elevenLabsReadinessReceiptMetadata(status, receipt),
    });
  });
  return { ...receipt, stored: true };
}
