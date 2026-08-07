import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

// Pins the 2026-08-07 adversarial-audit fixes across the outbound engine,
// comms subsystem, and team authorization. Each block names the failure the
// fix closed; if an assertion here starts failing, the regression it guards
// against is concrete consumer harm (double calls, dropped messages, stranded
// leads), not style.
describe("outbound engine hardening", () => {
  const dialer = read("src/services/campaign-dialer.ts");

  it("campaigns have a continuation driver and drain before completing", () => {
    // Launch and the call-window rescheduler were the ONLY producers of
    // campaign_dial jobs: a >50-lead campaign dialed one batch and stalled
    // RUNNING forever, and completion could fire with calls still in flight.
    expect(dialer).toContain("ensureDialJob");
    expect(dialer).toContain("processable leads remain");
    expect(dialer).toContain("calls in flight");
    // Completion only after both checks (the COMPLETED write is last).
    const processIdx = dialer.indexOf("private async processCampaignLeads");
    const completeIdx = dialer.indexOf("CAMPAIGN_STATUS.COMPLETED, updatedAt", processIdx);
    expect(dialer.lastIndexOf("ensureDialJob(", completeIdx)).toBeGreaterThan(processIdx);
  });

  it("dialLead atomically claims the lead and never retires it on a provider blip", () => {
    // Two concurrent dial jobs both selected the same 50 Queued leads and
    // double-called consumers; a single Vapi 502 wrote terminal Error.
    const dial = dialer.slice(dialer.indexOf("private async dialLead"));
    expect(dial).toContain("status: LEAD_STATUS.DIALING");
    expect(dial).toContain("LEAD_PROCESSABLE_STATUSES");
    expect(dial).toContain("if (claimed.length === 0)");
    expect(dial).toContain("LEAD_STATUS.MAX_ATTEMPTS : LEAD_STATUS.RETRYING");
    expect(dial).not.toContain("status: LEAD_STATUS.ERROR");
    // A failed placement must not stamp lastCalledAt (no call happened) —
    // the 24h window would otherwise suppress the retry for a day.
    expect(dial).toContain("if (placed) return;");
  });

  it("launch transition is guarded and retry-failed reaches Error leads", () => {
    const routes = read("src/routes/campaign-routes.ts");
    expect(routes).toContain("ne(schema.outboundCampaigns.status, CAMPAIGN_STATUS.RUNNING)");
    expect(routes).toContain("[LEAD_STATUS.QUEUED, LEAD_STATUS.RETRYING]");
    expect(routes).toContain("[LEAD_STATUS.FAILED, LEAD_STATUS.ERROR]");
    expect(routes).toContain("status: LEAD_STATUS.QUEUED, attempts: 0");
  });

  it("cadence steps defer temporal gate denials and survive one exception", () => {
    const engine = read("src/lib/cadence-engine.ts");
    expect(engine).toContain("defer: temporal");
    expect(engine).toContain("if (stepResult.defer)");
    expect(engine).toContain("CADENCE_TEMPORAL_DEFER_MS");
    expect(engine).toContain("STEP_EXCEPTION_RETRY_PREFIX");
    // Cadence dials stamp the lead and write consent-ledger evidence like the
    // campaign dialer, so the shared 24h duplicate window sees them.
    expect(engine).toContain("lastCalledAt: new Date()");
    expect(engine).toContain('event: "outbound_call_placed"');
    expect(engine).toContain('source: "cadence"');
  });

  it("callback claim is fenced on the exact due timestamp and records the dial", () => {
    const engine = read("src/lib/callback-engine.ts");
    expect(engine).toContain(
      "eq(schema.outboundLeads.callbackScheduledAt, lead.callbackScheduledAt!)",
    );
    expect(engine).toContain('call_purpose: "callback"');
    expect(engine).toContain("lastCalledAt: new Date()");
  });

  it("text-inferred followup outcomes get a real callback schedule", () => {
    const tracking = read("src/lib/outbound-call-tracking.ts");
    expect(tracking).toContain("newStatus === LEAD_STATUS.CALLBACK_SCHEDULED");
    expect(tracking).toContain("COALESCE");
  });

  it("intake auto-dial defers quiet-hours leads instead of retiring them", () => {
    const intake = read("src/routes/intake-routes.ts");
    expect(intake).toContain('gate.reason === "outside_permitted_calling_hours"');
    expect(intake).toContain("deferred_quiet_hours");
  });

  it("mobile dial takes the same double-dial reservation as web", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    expect(mobile).toContain("outboundDialReservations");
    expect(mobile).toContain("DIAL_ALREADY_IN_PROGRESS");
    expect(mobile).toContain("normalizeOutboundNumber");
  });

  it("cadence re-enrollment is only blocked while a run is active", () => {
    expect(read("src/db/schema-base.ts")).toContain(
      "idx_cadence_runs_lead_unique ON wireline_cadence_runs (lead_id, cadence_id) WHERE status = 'active'",
    );
    expect(read("drizzle/migrations/0137_per_tenant_sync_keys_and_reenrollment.sql")).toContain(
      "WHERE status = 'active'",
    );
    expect(read("drizzle/migrations/meta/_journal.json")).toContain(
      "0137_per_tenant_sync_keys_and_reenrollment",
    );
  });
});

describe("comms hardening", () => {
  it("email sync keys are per-tenant, not global", () => {
    // Sender/provider-chosen ids repeat across tenants' mailboxes: a global
    // unique let one tenant's row break another tenant's entire sync.
    const sync = read("src/routes/email-sync-routes.ts");
    expect(sync).toContain("[schema.emailThreads.userId, schema.emailThreads.threadId]");
    expect(sync).toContain("[schema.emailMessages.userId, schema.emailMessages.googleMessageId]");
    expect(sync).toContain("setWhere");
    const schemaBase = read("src/db/schema-base.ts");
    expect(schemaBase).toContain("uq_email_threads_user_thread");
    expect(schemaBase).toContain("uq_email_messages_user_google_message");
    expect(schemaBase).not.toContain('text("thread_id").unique()');
    expect(schemaBase).not.toContain('text("google_message_id").unique()');
  });

  it("platform-fallback email respects suppression and carries unsubscribe plumbing", () => {
    const integrations = read("src/lib/integrations.ts");
    expect(integrations).toContain("isEmailSuppressed(params.to)");
    expect(integrations).toContain("buildListUnsubscribeHeaders(params.to)");
    expect(integrations).toContain("buildComplianceFooterText(params.to)");
    expect(integrations).toContain("buildComplianceFooterHtml(params.to)");
  });

  it("inbound SMS persistence failures ask Twilio to redeliver", () => {
    // Answering 200 after a failed persist tells Twilio the message was
    // delivered; it never retries and the customer's text silently vanishes.
    const webhook = read("src/routes/twilio-webhook-base.ts");
    expect(webhook).toContain("res.status(503).send(twimlEmpty())");
    expect(webhook).not.toContain("SMS thread persist skipped");
    // First-contact thread creation tolerates the unique race on both paths.
    const persistBlock = webhook.slice(webhook.indexOf("const [existingThread]"));
    expect(persistBlock).toContain("onConflictDoNothing()");
    expect(read("src/lib/twilio-service.ts")).toContain("onConflictDoNothing()");
  });

  it("every subscribable webhook event has a real producer", () => {
    const helpers = read("src/lib/webhook-helpers.ts");
    // Anchor on `= [` so the `WebhookEvent[]` type annotation's bracket is
    // not mistaken for the array literal.
    const open = helpers.indexOf("= [", helpers.indexOf("export const WEBHOOK_EVENTS"));
    const eventsBlock = helpers.slice(open, helpers.indexOf("]", open + 3));
    const events = Array.from(eventsBlock.matchAll(/"([^"]+)"/g), (m) => m[1]);
    expect(events.length).toBeGreaterThanOrEqual(10);
    // The five events removed for having no producer stay out until wired.
    for (const dead of [
      "compliance.flagged",
      "knowledge_updated",
      "slo.jobs.critical",
      "slo.webhooks.degraded",
      "slo.enrichment.dead",
    ]) {
      expect(events).not.toContain(dead);
    }
    // The two newly-wired producers exist.
    expect(read("src/routes/email-sync-routes.ts")).toContain('"email.received"');
    expect(read("src/lib/action-engine.ts")).toContain('"task.created"');
  });
});

describe("team authorization hardening", () => {
  it("invites enforce the role-grant hierarchy", () => {
    const team = read("src/routes/team-routes.ts");
    expect(team).toContain("canGrantRole(granterRole, targetRole)");
  });

  it("account export omits invite token hashes", () => {
    const settings = read("src/routes/settings-routes.ts");
    expect(settings).toContain("invitationTokenHash");
    expect(settings).toContain("exportOmitColumns");
  });
});
