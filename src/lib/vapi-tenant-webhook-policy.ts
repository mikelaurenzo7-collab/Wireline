import { liveExternalActionPolicy } from "./account-environment-policy";

const VAPI_TENANT_EVIDENCE_MESSAGE_TYPES = new Set([
  "status-update",
  "speech-update",
  "transcript",
  "conversation-update",
  "language-change-detected",
  "end-of-call-report",
]);

export type VapiTenantWebhookPolicy =
  | {
      allowed: true;
      evidenceOnly: boolean;
      externalEffectsAllowed: boolean;
    }
  | {
      allowed: false;
      evidenceOnly: false;
      externalEffectsAllowed: false;
      status: 403 | 503;
      code: string;
      message: string;
    };

export function isVapiTenantEvidenceMessage(messageType: string): boolean {
  return VAPI_TENANT_EVIDENCE_MESSAGE_TYPES.has(messageType);
}

/**
 * Signed tenant callbacks split into two trust classes after tenant ownership
 * is resolved. Production work may execute normally. Non-production or
 * unclassified workspaces may still deliver provider evidence and local call
 * state, but cannot ask BotBound to create a new assistant, execute tools, or
 * accept a future unknown callback as new work.
 */
export function vapiTenantWebhookPolicy(
  accountEnvironment: string | null | undefined,
  messageType: string,
): VapiTenantWebhookPolicy {
  const environment = liveExternalActionPolicy(accountEnvironment);
  if (environment.allowed) {
    return { allowed: true, evidenceOnly: false, externalEffectsAllowed: true };
  }
  if (isVapiTenantEvidenceMessage(messageType)) {
    return { allowed: true, evidenceOnly: true, externalEffectsAllowed: false };
  }
  return {
    allowed: false,
    evidenceOnly: false,
    externalEffectsAllowed: false,
    status: environment.status,
    code: environment.code,
    message: environment.message,
  };
}
