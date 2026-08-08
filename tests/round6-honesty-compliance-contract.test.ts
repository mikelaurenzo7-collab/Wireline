import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

// Round-4 audit (branch claude/code-review-merge-pghohk): honesty + compliance
// fixes. Each block pins one verified bug so it cannot quietly regress.

describe("SMS opt-in cannot clear manual/legal DNC rows", () => {
  it("scopes the base-route resubscribe delete to SMS-created suppressions", () => {
    const base = read("src/routes/twilio-webhook-base.ts");
    // The interceptor in twilio-webhook.ts only catches EXACT keyword bodies;
    // "yes please" falls through to the base route via matchesCarrierKeyword's
    // leading-word match — so the base delete must carry the same scope.
    const optInBlock = base.slice(
      base.indexOf("matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS)"),
      base.indexOf("matchesCarrierKeyword(trimmed, HELP_KEYWORDS)"),
    );
    expect(optInBlock).toContain('eq(schema.dncList.reason, "opt-out")');
    expect(optInBlock).toContain('eq(schema.dncList.source, "twilio_advanced_opt_out")');
    expect(optInBlock).toContain('eq(schema.dncList.source, "sms_opt_out")');
  });

  it("never confirms an opt-out/opt-in whose write failed", () => {
    const base = read("src/routes/twilio-webhook-base.ts");
    expect(base).toContain("We couldn't process your unsubscribe request just now.");
    expect(base).toContain("We couldn't process your resubscribe request just now.");
    // STOP persistence failure pages ops instead of vanishing into a log line.
    const optOutBlock = base.slice(
      base.indexOf("matchesCarrierKeyword(trimmed, OPT_OUT_KEYWORDS)"),
      base.indexOf("matchesCarrierKeyword(trimmed, OPT_IN_KEYWORDS)"),
    );
    expect(optOutBlock).toContain("reportError(");
    const interceptor = read("src/routes/twilio-webhook.ts");
    expect(interceptor).toContain("We couldn't process your resubscribe request just now.");
  });
});

describe("voice tool handlers tell the truth", () => {
  it("add_to_dnc failure is admitted to the consumer, not papered over", () => {
    const handlers = read("src/routes/vapi/tool-handlers-core.ts");
    expect(handlers).not.toContain(
      "I've noted your preference. We'll make sure that's taken care of.",
    );
    expect(handlers).toContain(
      "I wasn't able to add that number to the Do Not Call list just now.",
    );
  });

  it("update_lead_status reports a no-op instead of claiming success", () => {
    const handlers = read("src/routes/vapi/tool-handlers-core.ts");
    expect(handlers).toContain("so the status wasn't updated");
    expect(handlers).toContain(".returning({ id: schema.outboundLeads.id })");
    expect(handlers).not.toContain(
      "I've noted that update. Someone from the team will confirm shortly.",
    );
  });
});

describe("email unsubscribe endpoints honor the write result", () => {
  it("one-click POST returns 503 (retryable) when the suppression write fails", () => {
    const routes = read("src/routes/email-unsubscribe-routes.ts");
    expect(routes).toContain(
      'const recorded = await recordTarget(target, "one_click_unsubscribe")',
    );
    expect(routes).toContain("res.status(503).json({ ok: false, unsubscribed: false })");
  });

  it("the human GET page never renders success over a failed write", () => {
    const routes = read("src/routes/email-unsubscribe-routes.ts");
    expect(routes).toContain(
      'const recorded = await recordTarget(target, "link_unsubscribe")',
    );
    expect(routes).toContain("We couldn't process that just now");
  });
});

describe("Meta data-deletion callback", () => {
  it("returns 5xx on a failed deactivation so Facebook retries", () => {
    const routes = read("src/routes/meta-webhook-routes.ts");
    expect(routes).toContain(
      'throw AppError.fromHttpStatus(503, "deletion request could not be recorded — retry")',
    );
    expect(routes).not.toContain("Still return 200 with the code");
  });
});

describe("agent capacity is race-safe on the MCP draft path", () => {
  it("serializes count + check + insert with the per-tenant advisory lock", () => {
    const service = read("src/lib/agent-draft-service.ts");
    const createBlock = service.slice(
      service.indexOf("export async function createAgentDraft"),
      service.indexOf("export async function getAgentDraft"),
    );
    expect(createBlock).toContain("drizzle.transaction");
    expect(createBlock).toContain("pg_advisory_xact_lock(hashtext(");
    expect(createBlock).toContain("tx.insert(schema.agents)");
  });
});

describe("sentinel killCall verifies the Vapi response", () => {
  it("does not mark presence terminated when the terminate call was rejected", () => {
    const sentinel = read("src/services/sentinel.ts");
    expect(sentinel).toContain("if (!response.ok)");
    const okCheck = sentinel.indexOf("if (!response.ok)");
    const presenceUpdate = sentinel.indexOf('set({ status: "terminated" })');
    expect(okCheck).toBeGreaterThan(-1);
    expect(presenceUpdate).toBeGreaterThan(okCheck);
  });
});
