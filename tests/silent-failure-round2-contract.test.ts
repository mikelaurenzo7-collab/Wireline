import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { matchesCarrierKeyword } from "../src/lib/carrier-keywords";
import {
  resendBounceIsPermanent,
  resendEventDetailCode,
  resendPermanentSuppressionReason,
} from "../src/lib/resend-webhook";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Round-2 silent-failure audit. Each block pins one verified defect: a feature
 * that shipped, was reachable in production, and quietly did the wrong thing.
 * These are behavioral where the unit is pure and source-reading where the
 * invariant is structural, matching the repository's existing contract style.
 */

describe("carrier keyword matching is generous only where over-matching fails safe", () => {
  const OPT_OUT = new Set(["stop", "cancel", "end", "quit", "unsubscribe"]);
  const OPT_IN = new Set(["start", "unstop", "yes", "optin"]);
  const HELP = new Set(["help", "info", "support"]);
  const norm = (raw: string) => raw.trim().toLowerCase();

  it("keeps leading-word tolerance for opt-out", () => {
    // Over-suppressing is the safe direction — the consumer stops hearing from us.
    expect(matchesCarrierKeyword(norm("STOP CALLING ME"), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("STOP."), OPT_OUT)).toBe(true);
    expect(matchesCarrierKeyword(norm("please don't stop the updates"), OPT_OUT)).toBe(false);
  });

  it("requires an exact keyword for opt-in, so an ordinary reply is not a consent grant", () => {
    expect(matchesCarrierKeyword(norm("START"), OPT_IN, "exact")).toBe(true);
    expect(matchesCarrierKeyword(norm("  yes!  "), OPT_IN, "exact")).toBe(true);
    // The defect: these wrote an sms_opt_in consent row AND swallowed the message.
    expect(matchesCarrierKeyword(norm("Yes please, Tuesday at 3 works"), OPT_IN, "exact")).toBe(
      false,
    );
    expect(matchesCarrierKeyword(norm("yes that's right"), OPT_IN, "exact")).toBe(false);
    expect(matchesCarrierKeyword(norm("start the service next month"), OPT_IN, "exact")).toBe(
      false,
    );
  });

  it("requires an exact keyword for HELP, so a real support request reaches the agent", () => {
    expect(matchesCarrierKeyword(norm("HELP"), HELP, "exact")).toBe(true);
    expect(matchesCarrierKeyword(norm("Help me reschedule my appointment"), HELP, "exact")).toBe(
      false,
    );
    expect(matchesCarrierKeyword(norm("Info on pricing please"), HELP, "exact")).toBe(false);
    expect(matchesCarrierKeyword(norm("support for my broken unit"), HELP, "exact")).toBe(false);
  });

  it("wires exact matching into both SMS consent paths", () => {
    const interceptor = read("src/routes/twilio-webhook.ts");
    expect(interceptor).toContain("matchesCarrierKeyword(bodyKeyword, LEGACY_OPT_OUT_KEYWORDS)");
    expect(interceptor).toContain(
      'matchesCarrierKeyword(bodyKeyword, LEGACY_OPT_IN_KEYWORDS, "exact")',
    );

    const base = read("src/routes/twilio-webhook-base.ts");
    expect(base).toContain("matchesCarrierKeyword(trimmed, OPT_OUT_KEYWORDS)");
    expect(base).toContain('matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS, "exact")');
    expect(base).toContain('matchesCarrierKeyword(trimmed, HELP_KEYWORDS, "exact")');

    // The keyword branches return before the inbound-message store, which is why
    // an over-match lost the customer's words. Pin that ordering.
    expect(base.indexOf("matchesCarrierKeyword(trimmed, HELP_KEYWORDS")).toBeLessThan(
      base.indexOf("insert(schema.smsMessages)"),
    );
  });
});

describe("Resend bounce suppression is permanent only for permanent bounces", () => {
  it("suppresses a Permanent bounce", () => {
    expect(resendBounceIsPermanent({ bounce: { type: "Permanent" } })).toBe(true);
    expect(
      resendPermanentSuppressionReason("email.bounced", { bounce: { type: "Permanent" } }),
    ).toBe("resend_bounced");
  });

  it("does not permanently block a mailbox that was merely full or greylisted", () => {
    expect(resendBounceIsPermanent({ bounce: { type: "Transient" } })).toBe(false);
    expect(resendBounceIsPermanent({ bounce: { type: "transient" } })).toBe(false);
    expect(resendBounceIsPermanent({ bounce: { type: "Undetermined" } })).toBe(false);
    expect(
      resendPermanentSuppressionReason("email.bounced", { bounce: { type: "Transient" } }),
    ).toBeNull();
    expect(resendEventDetailCode("email.bounced", false)).toBe("transient_bounce_observed");
  });

  it("stays conservative when the provider sends no classification", () => {
    expect(resendBounceIsPermanent({})).toBe(true);
    expect(resendPermanentSuppressionReason("email.bounced", {})).toBe("resend_bounced");
  });

  it("leaves complaint and explicit-suppression events unconditional", () => {
    expect(resendPermanentSuppressionReason("email.complained", {})).toBe("resend_complained");
    expect(resendPermanentSuppressionReason("email.suppressed", {})).toBe("resend_suppressed");
    expect(resendPermanentSuppressionReason("email.delivered", {})).toBeNull();
  });

  it("classifies the live event with the payload, not the event type alone", () => {
    const processor = read("src/lib/resend-webhook.ts");
    expect(processor).toContain("resendPermanentSuppressionReason(eventType, data)");
  });
});

describe("the demo-line recap is treated as the commercial email it is", () => {
  it("honors suppression, requires a postal address, and carries unsubscribe affordances", () => {
    const funnel = read("src/lib/demo-funnel.ts");
    const sender = funnel.slice(funnel.indexOf("export async function sendDemoRecapEmail"));
    expect(sender).toContain("if (!getPostalAddress())");
    expect(sender).toContain("await isEmailSuppressed(args.to)");
    expect(sender).toContain('buildComplianceFooterText(args.to, "demo_line_recap")');
    expect(sender).toContain('buildComplianceFooterHtml(args.to, "demo_line_recap")');
    expect(sender).toContain("headers: buildListUnsubscribeHeaders(args.to)");
  });

  it("tells a demo caller the truth about why they were emailed", () => {
    const compliance = read("src/lib/email-compliance.ts");
    expect(compliance).toContain("you asked for a recap on Wireline's demo line");
    // The account-holder wording must survive for every existing caller.
    expect(compliance).toContain("you have a Wireline account");
  });
});

describe("authFetch declares JSON so Express actually parses the body", () => {
  it("defaults Content-Type for string bodies without overriding an explicit header", () => {
    const api = read("src/lib/api-base.ts");
    expect(api).toContain(
      'if (typeof rest.body === "string" && !mergedHeaders.has("Content-Type"))',
    );
    expect(api).toContain('mergedHeaders.set("Content-Type", "application/json")');
  });

  it("leaves no authFetch caller sending a JSON body Express would discard", () => {
    const files = [
      "src/components/GoalsView.tsx",
      "src/components/PhoneNumberPicker.tsx",
      "src/components/SmsThreads.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      // Every POST body in these surfaces is JSON.stringify(...), and the shared
      // default above is what makes each of them parseable.
      expect(source, file).toContain("JSON.stringify");
    }
  });
});

describe("SMS inbox never paints one thread's messages under another's header", () => {
  it("passes the open thread's abort signal to the post-send refresh", () => {
    const component = read("src/components/SmsThreads.tsx");
    expect(component).toContain("activeThreadFetchRef");
    // Captured at send time. Reading the ref after the await would hand this
    // refresh a live signal belonging to whichever thread was opened since.
    expect(component).toContain("const sentThreadController = activeThreadFetchRef.current;");
    expect(component).toContain("fetchMessages(threadId, sentThreadController?.signal)");
    // The selection effect owns the controller and must publish it to the ref.
    expect(component).toContain("activeThreadFetchRef.current = controller");
  });
});

describe("the opening greeting is replaced, not appended", () => {
  it("always sends the greeting as a prefix replace, including when cleared", () => {
    const panel = read("src/components/StudioAgentWorkspacePanel.tsx");
    expect(panel).toContain('const GREETING_PREFIX = "Opening greeting:"');
    expect(panel).toContain("GREETING_PREFIX,");
    // The old shape gated the call on a non-empty greeting, so clearing no-op'd.
    expect(panel).not.toContain("if (greetingTrimmed) {");
  });

  it("makes the server delete the previous greeting in the same transaction", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const manual = routes.slice(
      routes.indexOf('"/api/agent-config/:id/manual"'),
      routes.indexOf('"/api/agent-config/:id/runtime"'),
    );
    expect(manual).toContain("const replacePrefix = cleanText(req.body?.replacePrefix, 120)");
    expect(manual).toContain("drizzle.transaction");
    expect(manual).toContain(".delete(schema.directives)");
    // Empty content is a deliberate clear only in replace mode.
    expect(manual).toContain("if (!content && !isPrefixReplace)");
  });
});

describe("a scheduled report survives a failed runtime reservation", () => {
  it("chains the next occurrence before the reservation can throw", () => {
    const worker = read("src/lib/job-worker.ts");
    const handler = worker.slice(
      worker.indexOf("async function handleScheduledReport"),
      worker.indexOf("/** Global durable-job dispatcher"),
    );
    const rescheduleAt = handler.indexOf("ensureNextScheduledReport(");
    const reserveAt = handler.indexOf("withRuntimeReservation(");
    expect(rescheduleAt).toBeGreaterThan(-1);
    expect(reserveAt).toBeGreaterThan(-1);
    expect(rescheduleAt).toBeLessThan(reserveAt);
  });

  it("reuses the preferences it already loaded rather than re-reading them", () => {
    const worker = read("src/lib/job-worker.ts");
    expect(worker).toContain(
      "const preferences = await currentScheduledReportPreferences({ ...payload, format, destination })",
    );
  });
});

describe("a cadence retries a failed touch instead of consuming the step", () => {
  it("branches on a retryable step failure before advancing", () => {
    const engine = read("src/lib/cadence-engine.ts");
    const advanceAt = engine.indexOf("const nextIdx = currentIdx + 1");
    const retryAt = engine.indexOf("if (!stepResult.ok && stepResult.retryable)");
    expect(retryAt).toBeGreaterThan(-1);
    expect(retryAt).toBeLessThan(advanceAt);
    // Shares the exception path's single-retry budget and marker.
    const retryBlock = engine.slice(retryAt, advanceAt);
    expect(retryBlock).toContain("STEP_EXCEPTION_RETRY_PREFIX");
    expect(retryBlock).toContain("CADENCE_EXCEPTION_RETRY_MS");
  });

  it("never retries a permanent outcome", () => {
    const engine = read("src/lib/cadence-engine.ts");
    const step = engine.slice(
      engine.indexOf("async function executeStep"),
      engine.indexOf("const CADENCE_STEP_LEASE_MS"),
    );
    // Hard compliance denials, missing contact details, and unknown step types
    // must keep returning without a retryable flag.
    expect(step).toContain(
      "return { ok: false, result: `skipped — ${gate.reason}`, defer: temporal }",
    );
    expect(step).toContain('return { ok: false, result: "no phone number on lead" }');
    expect(step).toContain('return { ok: false, result: "no email on lead" }');
    // Provider sends are never retried either: neither Vapi call creation nor
    // Twilio message creation is idempotent, so a retry can double-contact a
    // consumer — worse under TCPA than the dropped touch it would recover.
    expect(step).not.toContain("retryable: !res.ok");
    expect(step).not.toContain("retryable: !ok");
  });
});

describe("auto-QA failures reach the retry queue", () => {
  it("re-throws so the job is not marked done on a provider hiccup", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const block = worker.slice(
      worker.indexOf('log.error("auto_qa_score failed"'),
      worker.indexOf('if (job.type === "sweep_orphan_supervisor_subs")'),
    );
    expect(block).toContain("throw err;");
  });

  it("keeps an idempotency guard that makes a retry safe", () => {
    // The guard must exist, but it must key on the RUBRIC having run — not on
    // `qaScore != null`. The Vapi end-of-call handler writes a provisional
    // heuristic score on every call before this job is enqueued, so the old
    // null-check was true every time and the rubric never ran once. See
    // qa-score-provenance.ts.
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("qaRubricShouldRun(call.qaBreakdown)");
    expect(worker).toContain("auto_qa_score skipped — rubric already scored");
    expect(worker).not.toContain("if (call.qaScore != null) {");
  });
});

describe("every AI-spending surface reaches the spend ledger", () => {
  it("meters the Google Drive knowledge sync", () => {
    const route = read("src/routes/workspace-knowledge-routes.ts");
    expect(route).toContain('withAudit("workspace-knowledge")');
    expect(route.indexOf("authenticateUser")).toBeLessThan(route.indexOf('withAudit("'));
  });

  it("meters mid-call Vapi tool dispatch", () => {
    const route = read("src/routes/vapi-v2.ts");
    const arm = route.slice(
      route.indexOf('if (message?.type === "tool-calls")'),
      route.indexOf('if (message?.type === "speech-update")'),
    );
    expect(arm).toContain("const toolAuditContext = createAuditContext()");
    expect(arm).toContain("runInAuditContext(toolAuditContext");
    expect(arm).toContain('action: "vapi.tool-calls"');
    // Must not block the tool response — Vapi drops a slow result mid-call.
    expect(arm).toContain("runInBackground(");
    expect(arm.indexOf("runInBackground(")).toBeLessThan(
      arm.indexOf("return res.json({ results })"),
    );
  });
});

describe("the retention purge deletes event data, never live configuration", () => {
  const migration = read("drizzle/migrations/0148_retention_purge_spares_live_configuration.sql");

  it("drops the two configuration tables from the purge list", () => {
    const purgeList = migration.slice(
      migration.indexOf("FOR v_table IN SELECT * FROM (VALUES"),
      migration.indexOf("AS t(target_table_name"),
    );
    expect(purgeList).not.toContain("'wireline_webhooks'");
    expect(purgeList).not.toContain("'wireline_intake_keys'");
    // The delivery log is genuine event data and stays purgeable.
    expect(purgeList).toContain("'wireline_webhook_deliveries'");
    expect(purgeList).toContain("'wireline_call_logs'");
    expect(purgeList).toContain("'wireline_audit_log'");
  });

  it("keeps the hardening 0077 added", () => {
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("p_user_id is required");
    expect(migration).toContain("p_retention_days must be at least 1");
    expect(migration).toContain("EXCEPTION WHEN others THEN");
  });

  it("is journalled so the production build actually applies it", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: { tag: string }[];
    };
    expect(journal.entries.map((entry) => entry.tag)).toContain(
      "0148_retention_purge_spares_live_configuration",
    );
  });
});
