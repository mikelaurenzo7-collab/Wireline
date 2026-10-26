import { log } from "./server-context";
import {
  isSalesPurpose,
  resolveEffectiveOutboundPurpose,
  salesContentWarning,
  type OutboundCallPurpose,
  type OutboundPurpose,
  screenedDirectOutboundCall,
} from "./outbound-call-purpose";
import {
  CONTACT_PERMISSION_VERSION,
  CUSTOMER_SINCE_REQUIRED_MESSAGE,
  NONSALES_CONFIRMATION_VERSION,
  NONSALES_REQUIRED_MESSAGE,
  PERMISSION_REQUIRED_MESSAGE,
} from "./outbound-compliance-copy";
import {
  readContactOutboundRecord,
  rememberContactOutbound,
} from "./outbound-contact-consent";
import { recordOutboundPurposeAudit } from "./outbound-purpose-audit";
import { deriveRelationship, type DerivedRelationship } from "./outbound-relationship";
import { recordSalesDncAttestation } from "./sales-dnc-attestation";
import type { OutboundAuditInput } from "./outbound-dial-gate";

export type ManualOutboundBlock = {
  ok: false;
  status: number;
  code: string;
  error: string;
};

export type ManualOutboundScreen = {
  ok: true;
  screening: ReturnType<typeof screenedDirectOutboundCall> & {
    requestedCallPurpose: OutboundPurpose;
  };
  relationship: DerivedRelationship | null;
  customerSince: Date | null;
  contentWarning: string | null;
  audit: OutboundAuditInput;
};

function parseCustomerSince(value: string | null | undefined): Date | null {
  if (!value || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Manual dial and non-automated SMS. Relationship can only loosen sales.
 * Confirmations are required once per contact. Campaigns, cadences, intake,
 * and callbacks do not use this helper.
 */
export async function screenManualOutbound(input: {
  userId: string;
  phone: string;
  channel: "call" | "sms";
  requestedPurpose: OutboundCallPurpose;
  permissionConfirmed?: boolean;
  nonsalesConfirmed?: boolean;
  customerSince?: string | null;
  content?: string | null;
  salesAttestationConfirmed?: boolean;
  actorIp?: string | null;
  userAgent?: string | null;
  relationship?: DerivedRelationship | null;
}): Promise<ManualOutboundBlock | ManualOutboundScreen> {
  const relationship =
    input.relationship === undefined
      ? await deriveRelationship(input.userId, input.phone)
      : input.relationship;
  const suppliedDate = parseCustomerSince(input.customerSince);
  const requested = input.requestedPurpose;
  if (
    requested === "existing_customer" &&
    (!suppliedDate || suppliedDate.getTime() > Date.now())
  ) {
    await block(input, relationship, "existing_customer", "existing_customer", CUSTOMER_SINCE_REQUIRED_MESSAGE);
    return {
      ok: false,
      status: 400,
      code: "CUSTOMER_SINCE_REQUIRED",
      error: CUSTOMER_SINCE_REQUIRED_MESSAGE,
    };
  }

  const resolved = resolveEffectiveOutboundPurpose({
    requested,
    relationshipReturning: Boolean(relationship),
    customerSince: suppliedDate,
  });

  let record;
  try {
    record = await readContactOutboundRecord(input.userId, input.phone);
  } catch (error) {
    log.warn("contact confirmation lookup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorText = "We couldn't check the saved permission for this number. Try again.";
    await block(input, relationship, resolved.requested, resolved.effective, errorText);
    return { ok: false, status: 503, code: "CONTACT_CONFIRMATION_UNAVAILABLE", error: errorText };
  }

  const reply = input.channel === "sms" && Boolean(relationship);
  const permissionOk = reply || record.permissionConfirmed || input.permissionConfirmed === true;
  const nonsalesNeeded = !reply && !isSalesPurpose(resolved.effective);
  const nonsalesOk =
    !nonsalesNeeded || record.nonsalesConfirmed || input.nonsalesConfirmed === true;
  const customerSince =
    resolved.effective === "existing_customer"
      ? suppliedDate
      : suppliedDate && resolved.requested === "existing_customer"
        ? suppliedDate
        : null;

  if (!permissionOk) {
    await block(input, relationship, resolved.requested, resolved.effective, PERMISSION_REQUIRED_MESSAGE, record);
    return { ok: false, status: 403, code: "CONTACT_PERMISSION_REQUIRED", error: PERMISSION_REQUIRED_MESSAGE };
  }
  if (!nonsalesOk) {
    await block(input, relationship, resolved.requested, resolved.effective, NONSALES_REQUIRED_MESSAGE, record);
    return { ok: false, status: 403, code: "NONSALES_CONFIRMATION_REQUIRED", error: NONSALES_REQUIRED_MESSAGE };
  }

  try {
    await rememberContactOutbound({
      userId: input.userId,
      phone: input.phone,
      purpose: resolved.effective,
      permissionConfirmed: input.permissionConfirmed === true,
      nonsalesConfirmed: input.nonsalesConfirmed === true,
      customerSince: resolved.effective === "existing_customer" ? suppliedDate : null,
    });
  } catch (error) {
    log.warn("contact confirmation was not saved", {
      error: error instanceof Error ? error.message : String(error),
    });
    const errorText = "We couldn't save the permission for this number. Try again.";
    await block(input, relationship, resolved.requested, resolved.effective, errorText, record);
    return { ok: false, status: 503, code: "CONTACT_CONFIRMATION_UNAVAILABLE", error: errorText };
  }

  const warning =
    resolved.effective === "sales" ? null : salesContentWarning(input.content);
  if (warning) {
    log.warn("non-sales outbound content looks like a sales pitch", {
      userId: input.userId,
      channel: input.channel,
      purpose: resolved.effective,
    });
  }

  if (isSalesPurpose(resolved.effective) && input.salesAttestationConfirmed === true) {
    try {
      await recordSalesDncAttestation({
        workspaceUserId: input.userId,
        actorUserId: input.userId,
      });
    } catch (error) {
      log.warn("sales attestation was not saved", {
        error: error instanceof Error ? error.message : String(error),
      });
      const errorText = "We couldn't save that sales confirmation. Try again.";
      await block(input, relationship, resolved.requested, resolved.effective, errorText, record);
      return { ok: false, status: 503, code: "SALES_ATTESTATION_UNAVAILABLE", error: errorText };
    }
  }

  const base = screenedDirectOutboundCall(resolved.effective);
  return {
    ok: true,
    screening: { ...base, requestedCallPurpose: resolved.requested },
    relationship,
    customerSince,
    contentWarning: warning,
    audit: {
      channel: input.channel,
      requestedPurpose: resolved.requested,
      effectivePurpose: resolved.effective,
      derivedRelationship: relationship,
      attested: permissionOk,
      attestationTextVersion: permissionOk ? CONTACT_PERMISSION_VERSION : null,
      confirmations: {
        permission: permissionOk,
        permissionTextVersion: permissionOk ? CONTACT_PERMISSION_VERSION : null,
        nonsales: nonsalesOk && nonsalesNeeded,
        nonsalesTextVersion: nonsalesNeeded && nonsalesOk ? NONSALES_CONFIRMATION_VERSION : null,
        reply,
      },
      customerSince,
      actorIp: input.actorIp ?? null,
      userAgent: input.userAgent ?? null,
    },
  };
}

async function block(
  input: {
    userId: string;
    phone: string;
    channel: "call" | "sms";
    actorIp?: string | null;
    userAgent?: string | null;
    permissionConfirmed?: boolean;
    nonsalesConfirmed?: boolean;
  },
  relationship: DerivedRelationship | null,
  requested: string,
  effective: string,
  error: string,
  record?: { permissionConfirmed: boolean; nonsalesConfirmed: boolean },
): Promise<void> {
  await recordOutboundPurposeAudit({
    userId: input.userId,
    channel: input.channel,
    destinationE164: input.phone,
    requestedPurpose: requested,
    effectivePurpose: effective,
    derivedRelationship: relationship,
    attested: input.permissionConfirmed === true || record?.permissionConfirmed === true,
    confirmations: {
      permission: input.permissionConfirmed === true || record?.permissionConfirmed === true,
      nonsales: input.nonsalesConfirmed === true || record?.nonsalesConfirmed === true,
      error,
    },
    dncChecked: false,
    dncSource: "none",
    decision: "blocked",
    blockCode: "contact_confirmation_required",
    actorIp: input.actorIp ?? null,
    userAgent: input.userAgent ?? null,
  });
}
