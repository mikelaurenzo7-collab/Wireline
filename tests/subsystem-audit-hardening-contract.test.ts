import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clampRuntimePromptPreservingTail,
  MAX_RUNTIME_PROMPT_CHARS,
} from "../src/lib/vapi-helpers";
import { buildAgentRuntimeContext } from "../src/lib/agent-runtime";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Fixes from the six-angle subsystem audit. Each pins a verified
 * launch-critical defect on a path a regression would make silent: compliance
 * guardrails vanishing from long prompts, marketing mail ignoring opt-outs,
 * and a voice agent promising a follow-up it never records.
 */
describe("runtime prompt clamp preserves the WHOLE guardrail block", () => {
  it("keeps compliance / do-not-discuss / escalation, not just voice consistency", () => {
    // Reproduces the audit case: a per-item-cap-compliant but large config that
    // composes past the 18k clamp. Every guardrail section must survive; only
    // the head (base prompt + knowledge) may be trimmed.
    const bigBase = "BASE PROMPT FILLER. ".repeat(1600); // ~32k chars
    const built = buildAgentRuntimeContext(bigBase, {
      compliance_mode: "hipaa",
      disallowed_topics: ["refunds", "competitor pricing"],
      escalation_keywords: ["lawyer", "lawsuit"],
    } as never);
    expect(built.prompt.length).toBeGreaterThan(MAX_RUNTIME_PROMPT_CHARS);

    const clamped = clampRuntimePromptPreservingTail(built.prompt);
    expect(clamped.length).toBeLessThanOrEqual(MAX_RUNTIME_PROMPT_CHARS);
    expect(clamped).toContain("## COMPLIANCE: HIPAA");
    expect(clamped).toContain("## DO-NOT-DISCUSS TOPICS");
    expect(clamped).toContain("## IMMEDIATE-ESCALATION TRIGGERS");
    expect(clamped).toContain("## VOICE CONSISTENCY");
  });

  it("uses marker strings that actually match the emitted section headers", () => {
    // The old markers "## ESCALATION" / "## DO NOT DISCUSS" never matched the
    // real "## IMMEDIATE-ESCALATION TRIGGERS" / "## DO-NOT-DISCUSS TOPICS"
    // headers, so those guardrails were unprotected during a clamp.
    const helpers = read("src/lib/vapi-helpers.ts");
    expect(helpers).toContain('"\\n\\n## DO-NOT-DISCUSS TOPICS"');
    expect(helpers).toContain('"\\n\\n## IMMEDIATE-ESCALATION TRIGGERS"');
    expect(helpers).not.toContain('"\\n\\n## DO NOT DISCUSS"');
    expect(helpers).not.toMatch(/"\\n\\n## ESCALATION"/);
  });

  it("returns the input unchanged when it already fits", () => {
    const small = "short prompt\n\n## VOICE CONSISTENCY\n- one voice";
    expect(clampRuntimePromptPreservingTail(small)).toBe(small);
  });
});

describe("marketing email honors suppression and unsubscribe on every transport", () => {
  const integrations = read("src/lib/integrations.ts");

  it("checks sender-scoped suppression and builds compliant text + HTML inside the OAuth path", () => {
    // Connected Gmail/Microsoft/iCloud transports must all honor the tenant's
    // own suppression scope and commercial identity before choosing a carrier.
    const marketingBlock = integrations.slice(
      integrations.indexOf("if (params.marketing)"),
      integrations.indexOf("const account = mailAccounts[0]"),
    );
    expect(marketingBlock).toContain("isTenantEmailSuppressed");
    expect(marketingBlock).toContain("buildTenantComplianceFooterText");
    expect(marketingBlock).toContain("buildTenantComplianceFooterHtml");
    expect(marketingBlock).toContain("buildTenantListUnsubscribeHeaders");
  });

  it("carries RFC 8058 headers through Gmail raw MIME and Microsoft Graph MIME", () => {
    expect(integrations).toContain("buildConnectedMailboxMime(params)");
    expect(integrations).toContain("Object.entries(params.unsubscribeHeaders || {})");
    expect(integrations).toContain('"Content-Type": "text/plain"');
    expect(integrations).toContain('body: Buffer.from(message, "utf8").toString("base64")');
  });

  it("routes cadence email steps as marketing mail", () => {
    expect(read("src/lib/cadence-engine.ts")).toMatch(
      /integ\.sendEmail\(\{[\s\S]{0,200}marketing: true/,
    );
  });
});

describe("voice comms tools record a real task instead of fabricating follow-ups", () => {
  const handlers = read("src/routes/vapi/tool-handlers-core.ts");

  it("has a task-writing helper and no dead approved:false branches", () => {
    expect(handlers).toContain("async function recordCommsFollowUpTask");
    // The supervisor throws on block, so these fabricated-queue branches were
    // dead code that promised delivery while writing nothing.
    expect(handlers).not.toContain("I've queued that email up for you");
    expect(handlers).not.toContain("I've queued that message for you");
  });

  it("writes a follow-up task from both the send_email and send_text_message catch paths", () => {
    const emailBlock = handlers.slice(
      handlers.indexOf('if (fn === "send_email")'),
      handlers.indexOf('if (fn === "lookup_phone_number")'),
    );
    expect(emailBlock).toMatch(/catch[\s\S]{0,400}recordCommsFollowUpTask/);
    const smsBlock = handlers.slice(
      handlers.indexOf('if (fn === "send_text_message")'),
      handlers.indexOf('if (fn === "lookup_phone_number")'),
    );
    expect(smsBlock).toMatch(/catch[\s\S]{0,600}recordCommsFollowUpTask/);
  });

  it("action-engine converts a supervisor block into a pending draft task", () => {
    const engine = read("src/lib/action-engine.ts");
    expect(engine).toContain("ClientCommunicationBlockedError");
    expect(engine).toMatch(
      /catch \(err\)[\s\S]{0,400}ClientCommunicationBlockedError[\s\S]{0,200}handleSendEmail/,
    );
  });
});

describe("inbound webhook keeps the tenant binding from a resolved line", () => {
  const resolver = read("src/lib/vapi-webhook-agent.ts");

  it("rejects a prod request whose phoneNumberId did not resolve to a tenant", () => {
    // The guard was `!phoneNumberId` (presence); a bogus phoneNumberId slipped
    // past it into the unfenced query-agent path.
    expect(resolver).toContain("if (IS_PROD && !enforceTenantUserId)");
    expect(resolver).not.toContain("if (IS_PROD && !phoneNumberId)");
  });

  it("no longer nulls a tenant binding already established from a line", () => {
    const block = resolver.slice(
      resolver.indexOf("if (!resolvedAgentId && queryRaw)"),
      resolver.indexOf("if (!resolvedAgentId) {"),
    );
    expect(block).not.toContain("enforceTenantUserId = null");
  });
});

describe("account purge is not blocked by canceling an already-canceled sub", () => {
  const deletion = read("src/lib/account-deletion.ts");

  it("skips ids the live list already reported terminal", () => {
    expect(deletion).toMatch(/terminal\.has\(sub\.stripeSubscriptionId\)/);
  });

  it("treats an already-canceled 400 as already-gone", () => {
    expect(deletion).toMatch(/statusCode === 400[\s\S]{0,200}canceled/);
  });
});
