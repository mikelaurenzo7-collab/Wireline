import { and, eq, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { drizzle, log, tenantStore } from "./server-context";

export type AccountEnvironment = "production" | "test" | "demo";

export const NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED = "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED";
export const ACCOUNT_ENVIRONMENT_UNAVAILABLE = "ACCOUNT_ENVIRONMENT_UNAVAILABLE";
export const DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED = "DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED";

export type LiveExternalActionPolicy =
  | {
      allowed: true;
      environment: "production";
    }
  | {
      allowed: false;
      environment: "test" | "demo" | null;
      status: 403 | 503;
      code: typeof NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED | typeof ACCOUNT_ENVIRONMENT_UNAVAILABLE;
      message: string;
    };

export type PrivateTextSimulationPolicy =
  | {
      allowed: true;
      environment: AccountEnvironment;
    }
  | {
      allowed: false;
      environment: null;
      status: 503;
      code: typeof ACCOUNT_ENVIRONMENT_UNAVAILABLE;
      message: string;
    };

/**
 * Pure account-environment policy for live provider-backed work.
 *
 * Only an explicit production classification may perform work that can reach
 * an external system or person. Missing/unknown settings fail closed so a
 * partially-created tenant cannot inherit live-provider access from deployment
 * credentials. Bounded, tool-free private rehearsals use the separate policy
 * below because they cannot perform an external action.
 */
export function liveExternalActionPolicy(
  environment: string | null | undefined,
): LiveExternalActionPolicy {
  if (environment === "production") {
    return { allowed: true, environment };
  }
  if (environment === "demo" || environment === "test") {
    return {
      allowed: false,
      environment,
      status: 403,
      code: NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED,
      message: "Live external actions are disabled in this demo or test workspace.",
    };
  }
  return {
    allowed: false,
    environment: null,
    status: 503,
    code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
    message: "Live external actions are unavailable until this workspace is fully configured.",
  };
}

function classifiedPrivateSimulationPolicy(
  environment: string | null | undefined,
  unavailableMessage: string,
): PrivateTextSimulationPolicy {
  if (environment === "production" || environment === "demo" || environment === "test") {
    return { allowed: true, environment };
  }
  return {
    allowed: false,
    environment: null,
    status: 503,
    code: ACCOUNT_ENVIRONMENT_UNAVAILABLE,
    message: unavailableMessage,
  };
}

/**
 * Private text rehearsal is safe in every explicitly classified workspace.
 *
 * It consumes metered model capacity, so callers must still enforce the
 * tenant's persisted spend cap. It does not contact a person, invoke an agent
 * integration, or mutate an external provider. Unknown/missing account state
 * still fails closed before any model call.
 */
export function privateTextSimulationPolicy(
  environment: string | null | undefined,
): PrivateTextSimulationPolicy {
  return classifiedPrivateSimulationPolicy(
    environment,
    "Private text simulation is unavailable until this workspace is fully configured.",
  );
}

/**
 * Studio Preview Voice is the spoken equivalent of private text simulation.
 *
 * It mints metered OpenAI Realtime audio on the platform key, so callers must
 * still enforce the tenant's persisted spend cap. It cannot place PSTN, send
 * SMS or email, or invoke any tool except Training search. Unknown/missing
 * account state still fails closed before any provider call.
 */
export function privateVoiceSimulationPolicy(
  environment: string | null | undefined,
): PrivateTextSimulationPolicy {
  return classifiedPrivateSimulationPolicy(
    environment,
    "Preview Voice is unavailable until this workspace is fully configured.",
  );
}

async function accountEnvironmentForUser(userId: string): Promise<string | null> {
  return tenantStore.run(userId, async () => {
    const [row] = await drizzle
      .select({ accountEnvironment: schema.settings.accountEnvironment })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);
    return row?.accountEnvironment ?? null;
  });
}

export async function liveExternalActionPolicyForUser(
  userId: string,
): Promise<LiveExternalActionPolicy> {
  return liveExternalActionPolicy(await accountEnvironmentForUser(userId));
}

export async function privateTextSimulationPolicyForUser(
  userId: string,
): Promise<PrivateTextSimulationPolicy> {
  return privateTextSimulationPolicy(await accountEnvironmentForUser(userId));
}

export async function privateVoiceSimulationPolicyForUser(
  userId: string,
): Promise<PrivateTextSimulationPolicy> {
  return privateVoiceSimulationPolicy(await accountEnvironmentForUser(userId));
}

export async function assertLiveExternalActionAllowed(
  userId: string,
  action: string,
): Promise<void> {
  const policy = await liveExternalActionPolicyForUser(userId);
  if (policy.allowed) return;

  log.warn("Live external action blocked by account environment", {
    userId,
    action,
    accountEnvironment: policy.environment ?? "missing",
    code: policy.code,
  });
  throw new AppError(policy.status, policy.code, policy.message);
}

export async function assertPrivateTextSimulationAllowed(
  userId: string,
  action: string,
): Promise<void> {
  const policy = await privateTextSimulationPolicyForUser(userId);
  if (policy.allowed) return;

  log.warn("Private simulation blocked by account environment", {
    userId,
    action,
    accountEnvironment: "missing",
    code: policy.code,
  });
  throw new AppError(policy.status, policy.code, policy.message);
}

export async function assertPrivateVoiceSimulationAllowed(
  userId: string,
  action: string,
): Promise<void> {
  const policy = await privateVoiceSimulationPolicyForUser(userId);
  if (policy.allowed) return;

  log.warn("Private simulation blocked by account environment", {
    userId,
    action,
    accountEnvironment: "missing",
    code: policy.code,
  });
  throw new AppError(policy.status, policy.code, policy.message);
}

export type ExternalEntityTarget = {
  email?: unknown;
  phone?: unknown;
  leadId?: bigint | string | number | null;
  /** Pass through a row already loaded by the caller to avoid another lookup. */
  leadDemo?: boolean | null;
};

export type ExternalEntityActionPolicy =
  | { allowed: true }
  | {
      allowed: false;
      status: 403;
      code: typeof DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED;
      message: string;
      reason: "demo_lead" | "reserved_email" | "reserved_phone";
    };

function normalizedEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedPhoneDigits(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\D/g, "")
    : "";
}

/** RFC-reserved example domains are inert fixtures, never real recipients. */
export function isReservedDemoEmailAddress(value: unknown): boolean {
  const email = normalizedEmail(value);
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return false;
  const domain = email.slice(at + 1).replace(/\.+$/, "");
  return (
    domain === "example.com" ||
    domain.endsWith(".example.com") ||
    domain === "example.net" ||
    domain.endsWith(".example.net") ||
    domain === "example.org" ||
    domain.endsWith(".example.org") ||
    domain === "example" ||
    domain.endsWith(".example")
  );
}

/** NANP 555-0100 through 555-0199 is reserved for fictional use. */
export function isReservedDemoPhoneNumber(value: unknown): boolean {
  const digits = normalizedPhoneDigits(value);
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return /^[2-9]\d{2}55501\d{2}$/.test(national);
}

export function externalEntityActionPolicy(
  target: ExternalEntityTarget,
): ExternalEntityActionPolicy {
  if (target.leadDemo === true) {
    return {
      allowed: false,
      status: 403,
      code: DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
      message: "Live outreach to showcase data is disabled.",
      reason: "demo_lead",
    };
  }
  if (isReservedDemoEmailAddress(target.email)) {
    return {
      allowed: false,
      status: 403,
      code: DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
      message: "Live outreach to a reserved example address is disabled.",
      reason: "reserved_email",
    };
  }
  if (isReservedDemoPhoneNumber(target.phone)) {
    return {
      allowed: false,
      status: 403,
      code: DEMO_ENTITY_EXTERNAL_ACTION_BLOCKED,
      message: "Live outreach to a reserved fictional phone number is disabled.",
      reason: "reserved_phone",
    };
  }
  return { allowed: true };
}

function parseLeadId(value: ExternalEntityTarget["leadId"]): bigint | null {
  if (typeof value === "bigint") return value > 0n ? value : null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolve whether a tenant-owned target is seeded showcase data.
 *
 * The pure reserved-address check runs first. For otherwise-real-looking
 * destinations, a matching `demo=true` lead remains inert even if an operator
 * accidentally promotes the containing workspace to production.
 */
export async function externalEntityActionPolicyForUser(
  userId: string,
  target: ExternalEntityTarget,
): Promise<ExternalEntityActionPolicy> {
  const localPolicy = externalEntityActionPolicy(target);
  if (!localPolicy.allowed) return localPolicy;

  const leadId = parseLeadId(target.leadId);
  const email = normalizedEmail(target.email);
  const phoneDigits = normalizedPhoneDigits(target.phone);
  const phoneCandidates = phoneDigits
    ? Array.from(
        new Set([
          phoneDigits,
          ...(phoneDigits.length === 11 && phoneDigits.startsWith("1")
            ? [phoneDigits.slice(1)]
            : []),
          ...(phoneDigits.length === 10 ? [`1${phoneDigits}`] : []),
        ]),
      )
    : [];
  const identifiers = [
    ...(leadId ? [eq(schema.outboundLeads.id, leadId)] : []),
    ...(email ? [sql`lower(${schema.outboundLeads.email}) = ${email}`] : []),
    ...phoneCandidates.map(
      (candidate) =>
        sql`regexp_replace(coalesce(${schema.outboundLeads.customerNumber}, ''), '[^0-9]', '', 'g') = ${candidate}`,
    ),
  ];
  if (identifiers.length === 0) return { allowed: true };

  return tenantStore.run(userId, async () => {
    const [demoLead] = await drizzle
      .select({ id: schema.outboundLeads.id })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, userId),
          eq(schema.outboundLeads.demo, true),
          identifiers.length === 1 ? identifiers[0] : or(...identifiers),
        ),
      )
      .limit(1);
    return externalEntityActionPolicy({ ...target, leadDemo: Boolean(demoLead) });
  });
}

export async function assertExternalEntityActionAllowed(
  userId: string,
  action: string,
  target: ExternalEntityTarget,
): Promise<void> {
  const policy = await externalEntityActionPolicyForUser(userId, target);
  if (policy.allowed) return;

  log.warn("Live external action blocked for showcase entity", {
    userId,
    action,
    reason: policy.reason,
    code: policy.code,
  });
  throw new AppError(policy.status, policy.code, policy.message);
}
