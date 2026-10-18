import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { smsReplySchema } from "../src/lib/api-validation";
import { rateLimit } from "../src/lib/rate-limit";
import { LEAD_STATUS } from "../src/lib/outbound-status";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("outbound launch safety", () => {
  it("exports smsReplySchema for sms-routes contract", () => {
    expect(smsReplySchema).toBeDefined();
    expect(smsReplySchema.safeParse({ body: "hello" }).success).toBe(true);
    const smsRoutes = read("src/routes/sms-routes.ts");
    expect(smsRoutes).toContain("smsReplySchema");
    expect(smsRoutes).toContain('from "../lib/api-validation"');
    const validation = read("src/lib/api-validation-base.ts");
    expect(validation).toMatch(/export const sendSmsSchema[\s\S]*export const smsReplySchema/);
  });

  it("awaits enqueue after RUNNING and returns jobId on launch", () => {
    const launch = read("src/routes/campaign-routes.ts");
    expect(launch).toContain("const previousStatus = campaign.status");
    expect(launch).toContain("status: CAMPAIGN_STATUS.RUNNING");
    expect(launch).toContain("const enq = await enqueue(drizzle");
    expect(launch).toContain("jobId: enq.jobId");
    expect(launch).not.toMatch(/import\("\.\.\/lib\/job-queue"\)/);
    expect(launch).toContain('code: "CAMPAIGN_ENQUEUE_FAILED"');
    expect(launch).toContain("status: previousStatus");
  });

  it("requires federal DNC at launch for all campaigns", () => {
    const launch = read("src/routes/campaign-routes.ts");
    expect(launch).toContain("assertFederalDncForMarketing()");
    expect(launch).not.toContain("requiresFederalDnc");
    expect(launch).not.toContain("parsePlaybookFromGoal");
  });

  it("routes campaign_dial worker jobs by campaignId", () => {
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("processCampaignById(p.userId, p.campaignId)");
    expect(worker).toContain("campaign_dial job requires userId and campaignId");
    const dialer = read("src/services/campaign-dialer.ts");
    expect(dialer).toContain("async processCampaignById(userId: string, campaignId: string)");
  });

  it("defines duplicate skip status and preserves compliance outcomes", () => {
    expect(LEAD_STATUS.SKIPPED_DUPLICATE).toBe("Skipped-Duplicate");
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(gate).toContain("ne(schema.outboundLeads.id, BigInt(opts.leadId))");
    expect(gate).toContain("LEAD_STATUS.SKIPPED_DUPLICATE");
    expect(gate).toContain("LEAD_STATUS.CALLBACK_SCHEDULED");
    expect(gate).toContain("LEAD_STATUS.BLOCKED_DNC");
    expect(gate).toContain("LEAD_STATUS.BLOCKED_TCPA");
    expect(gate).toContain("self_within_24h");
    expect(gate).toContain("jsonSafeId(otherRecent.id)");
    const runtimeHelpers = read("src/lib/agent-runtime-helpers.ts");
    expect(runtimeHelpers).toContain("!UNVERIFIED_LIVE_TOOL_NAMES.has(name)");
    expect(runtimeHelpers).toContain("Existing lead status changes require team verification");
  });

  it("reschedules campaign_dial when outside workspace call window", () => {
    const dialer = read("src/services/campaign-dialer.ts");
    expect(dialer).toContain("rescheduleCampaignDial");
    expect(dialer).toContain("nextCallWindowOpenAt");
    expect(dialer).toContain('type: "campaign_dial"');
    expect(dialer).toContain("toJsonbSafe");
    expect(dialer).toContain("jsonSafeId(lead.id)");
  });

  it("indexes retrying leads with LEAD_STATUS.RETRYING value", () => {
    expect(LEAD_STATUS.RETRYING).toBe("Retrying");
    const schema = read("src/db/schema.ts");
    expect(schema).toContain("WHERE status IN ('Pending', 'Retrying')");
    expect(schema).not.toContain("WHERE status IN ('Pending', 'Retry')");
    const migration = read("drizzle/migrations/0086_fix_leads_retry_status_index.sql");
    expect(migration).toContain("WHERE status IN ('Pending', 'Retrying')");
  });

  it("gates intake auto-dial through shared outbound compliance helper", () => {
    const intake = read("src/lib/intake-auto-dial.ts");
    expect(intake).toContain("evaluateOutboundDialGate");
    expect(intake).toMatch(/evaluateOutboundDialGate[\s\S]*placeOutboundCall/s);
    const gate = read("src/lib/outbound-dial-gate.ts");
    expect(gate).toContain("hasExpressWrittenConsent");
    expect(gate).toContain("is_marketing_call: isMarketingCall");
    expect(gate).toContain("isMarketingCall?: boolean");
  });

  it("gates web dials and keeps native outbound independently closed without side effects", () => {
    const web = read("src/routes/outbound-routes.ts");
    const mobile = read("src/routes/mobile-routes.ts");
    expect(web).toContain("evaluateOutboundDialGate({");
    expect(web).toMatch(/evaluateOutboundDialGate[\s\S]*placeOutboundCall/s);
    expect(web).toContain("DUPLICATE_DIAL_SUPPRESSED");
    const native = mobile.slice(
      mobile.indexOf('"/api/mobile/calls/outbound"'),
      mobile.indexOf('// ── GET /api/mobile/calls/active'),
    );
    expect(native).toMatch(/authenticateUser,\s*mobileSensitiveRateLimiter,/);
    expect(native).toContain("res.status(503).json(NATIVE_OUTBOUND_UNAVAILABLE)");
    expect(native).not.toMatch(
      /BOTBOUND_GENERAL_OUTBOUND_ENABLED|outboundVoiceGuard|\.insert\(|\.update\(|\.delete\(/,
    );
    expect(mobile).not.toMatch(/placeOutboundCall|outboundDialReservations/);
  });

  it("charges bulk intake rate limit once with batch cost", () => {
    const intake = read("src/routes/intake-routes.ts");
    expect(intake).toContain("checkIntakeRate(key.id, leads.length)");
    expect(intake).not.toMatch(/for \(let i = 0; i < leads\.length; i\+\+\)[\s\S]*checkIntakeRate/);
  });

  it("redacts payment link URLs in logs", () => {
    const email = read("src/lib/email-service.ts");
    expect(email).toContain("redactPayUrlForLog");
    expect(email).not.toMatch(/payUrl:\s*opts\.payUrl/);
  });

  it("does not present unpublished public stats as live customer activity", () => {
    const marketing = read("src/routes/marketing-runtime-routes.ts");
    expect(marketing).toContain("published: false");
    expect(marketing).toContain('reason: "customer_activity_metrics_not_yet_published"');
    expect(marketing).not.toContain("as_of: new Date()");
  });

  it("returns 200 for invalid unsubscribe POST tokens", () => {
    const unsub = read("src/routes/email-unsubscribe-routes.ts");
    expect(unsub).toContain("unsubscribed: false");
    expect(unsub).not.toContain(
      'throw AppError.fromHttpStatus(400, "Invalid or missing unsubscribe token")',
    );
  });
});

describe("rateLimit cost", () => {
  it("charges multiple units in a single check", async () => {
    const key = "cost-key-" + Math.random();
    const opts = { bucket: "test-cost", windowMs: 60_000, max: 5 };
    const first = await rateLimit(key, { ...opts, cost: 3 });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    const second = await rateLimit(key, { ...opts, cost: 3 });
    expect(second.allowed).toBe(false);
    expect(second.remaining).toBe(0);
  });
});
