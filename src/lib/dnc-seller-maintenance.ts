import { createHash } from "node:crypto";
import { and, eq, notExists, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { acquireAccountDeletionFence } from "./account-deletion-fence";
import { getCanonicalAppUrl } from "./app-url";
import { isProductionDeployment } from "./deployment-environment";
import { checkDncScrubProject } from "./dnc-scrub-project";
import {
  DNC_RENEWAL_NOTICE_DAYS,
  DNC_SETUP_PATH,
  dncSellerRegistrationState,
  isDncRenewalDue,
  readDncSellerSetup,
  type DncSellerRegistration,
  type DncSellerSetup,
} from "./dnc-seller-registration-rules";
import { sendEmail } from "./email-service";
import { isDncScrubProjectConnectionConfigured } from "./federal-dnc-config";
import { drizzle, log, tenantStore } from "./server-context";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_WORKSPACES_PER_TICK = 2;
const stored = schema.settings.dncSellerRegistration;

type MaintenanceOptions = {
  now: Date;
  verify: boolean;
  remind: boolean;
};

function eligibleWorkspaces({ now, verify, remind }: MaintenanceOptions) {
  const today = now.toISOString().slice(0, 10);
  const renewBy = new Date(now.getTime() + DNC_RENEWAL_NOTICE_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return and(
    eq(schema.settings.accountEnvironment, "production"),
    notExists(
      drizzle.select({ id: schema.deletionQueue.id }).from(schema.deletionQueue)
        .where(sql`${schema.deletionQueue.userId} = ${schema.settings.userId}
          and ${schema.deletionQueue.status} in ('pending', 'purging')`),
    ),
    or(
      verify
        ? sql`${stored}->'verification'->>'state' = 'pending'
            and ${stored}->'verification'->>'next_check_at' <= ${now.toISOString()}`
        : undefined,
      remind
        ? sql`${stored}->>'vendor_campaign_id' is not null
            and ${schema.users.emailVerifiedAt} is not null
            and ${stored}->>'expires_on' between ${today} and ${renewBy}
            and (${stored}->>'renewal_reminder_for') is distinct from (${stored}->>'expires_on')
            and coalesce(${stored}->>'renewal_reminder_retry_at', '') <= ${now.toISOString()}`
        : undefined,
    ),
  );
}

async function advanceVerification(
  userId: string,
  setup: DncSellerSetup,
  now: Date,
): Promise<
  (Partial<DncSellerRegistration> & { verification?: DncSellerSetup["verification"] }) | null
> {
  const { verification, registration } = setup;
  if (
    verification?.state !== "pending" ||
    !verification.next_check_at ||
    verification.next_check_at > now.toISOString()
  )
    return null;
  const outcome = await checkDncScrubProject(userId, verification, now);
  if (outcome.state === "verified") {
    return {
      san: verification.san,
      ftc_org_id: verification.ftc_org_id,
      seller_name: verification.seller_name,
      area_codes: outcome.areaCodes,
      expires_on: outcome.expiresOn,
      attested_at: verification.attested_at,
      attested_by: verification.attested_by,
      vendor_project_id: outcome.projectCode,
      vendor_campaign_id: outcome.campaignId,
      vendor_linked_at: now.toISOString(),
      ...(registration?.renewal_reminder_for === outcome.expiresOn
        ? { renewal_reminder_for: outcome.expiresOn }
        : {}),
    };
  }

  const firstCheck = verification.first_check_at ?? now.toISOString();
  const elapsed = now.getTime() - Date.parse(firstCheck);
  const stillChecking = outcome.state !== "failed" && elapsed < 6 * HOUR_MS;
  const delay = elapsed < 10 * MINUTE_MS ? 90_000 : 15 * MINUTE_MS;
  return {
    ...registration,
    verification: {
      ...verification,
      state: stillChecking ? "pending" : outcome.state === "failed" ? "failed" : "unavailable",
      project_code: outcome.state === "pending" ? outcome.projectCode : verification.project_code,
      first_check_at: firstCheck,
      next_check_at: stillChecking ? new Date(now.getTime() + delay).toISOString() : null,
    },
  };
}

async function sendRenewalReminder(
  userId: string,
  email: string,
  registration: DncSellerRegistration,
  now: Date,
): Promise<DncSellerRegistration> {
  const expiresOn = registration.expires_on;
  const expiry = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${expiresOn}T00:00:00Z`),
  );
  const url = `${getCanonicalAppUrl()}${DNC_SETUP_PATH}`;
  const message = `Your Do Not Call Registry subscription expires on ${expiry}. Renew at the FTC Registry, then verify the current subscription number in BotBound to keep campaign screening active.`;
  const term = createHash("sha256").update(`${userId}:${expiresOn}`).digest("hex");
  const result = await sendEmail({
    to: email,
    subject: "Your Do Not Call Registry subscription is due for renewal",
    text: `${message}\n\nOpen Compliance: ${url}`,
    html: `<p>${message}</p><p><a href="${url}">Open Compliance</a></p>`,
    idempotencyKey: `dnc-renewal-${term}`,
  });
  if (result.ok || result.disposition === "suppressed")
    return { ...registration, renewal_reminder_for: expiresOn };
  return {
    ...registration,
    renewal_reminder_retry_at: new Date(now.getTime() + HOUR_MS).toISOString(),
  };
}

async function maintainWorkspace(userId: string, options: MaintenanceOptions): Promise<void> {
  const { now, verify, remind } = options;
  await tenantStore.run(userId, () =>
    drizzle.transaction(async (tx) => {
      await acquireAccountDeletionFence(tx, userId);
      const [row] = await tx
        .select({
          stored,
          email: schema.users.email,
          emailVerifiedAt: schema.users.emailVerifiedAt,
        })
        .from(schema.settings)
        .innerJoin(schema.users, eq(schema.users.id, schema.settings.userId))
        .where(and(eq(schema.settings.userId, userId), eligibleWorkspaces(options)))
        .for("update", { of: schema.settings });
      if (!row) return;
      const setup = readDncSellerSetup(row.stored);
      const registration = setup.registration;
      const verificationUpdate = verify ? await advanceVerification(userId, setup, now) : null;
      let next = verificationUpdate;
      if (
        !next &&
        remind &&
        row.emailVerifiedAt &&
        registration?.vendor_campaign_id &&
        dncSellerRegistrationState(registration, now) === "active" &&
        isDncRenewalDue(registration.expires_on, now) &&
        registration.renewal_reminder_for !== registration.expires_on &&
        (registration.renewal_reminder_retry_at ?? "") <= now.toISOString()
      ) {
        next = {
          ...(await sendRenewalReminder(userId, row.email, registration, now)),
          ...(setup.verification ? { verification: setup.verification } : {}),
        };
      }
      if (next)
        await tx
          .update(schema.settings)
          .set({ dncSellerRegistration: next, updatedAt: now })
          .where(eq(schema.settings.userId, userId));
    }),
  );
}

/** Run bounded, restart-safe maintenance from the authenticated jobs sweep. */
export async function sweepDncSellerRegistrations(now: Date): Promise<void> {
  if (!isProductionDeployment()) return;
  const verify = isDncScrubProjectConnectionConfigured();
  const remind = Boolean(process.env.RESEND_API_KEY?.trim());
  if (!verify && !remind) return;

  const options = { now, verify, remind };
  const rows = await drizzle
    .select({ userId: schema.settings.userId })
    .from(schema.settings)
    .innerJoin(schema.users, eq(schema.users.id, schema.settings.userId))
    .where(eligibleWorkspaces(options))
    .orderBy(
      sql`least(
        ${stored}->'verification'->>'next_check_at',
        ${stored}->>'expires_on'
      )`,
      schema.settings.userId,
    )
    .limit(MAX_WORKSPACES_PER_TICK);
  const results = await Promise.allSettled(
    rows.flatMap(({ userId }) => (userId ? [maintainWorkspace(userId, options)] : [])),
  );
  if (results.some((result) => result.status === "rejected"))
    log.error("DNC seller maintenance could not update one or more subscriptions");
}
