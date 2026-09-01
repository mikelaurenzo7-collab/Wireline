import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createInitialState,
  evaluateEscalation,
  WIRELINE_ESCALATION_RULES,
} from "../src/lib/wireline-agent-escalation";

describe("BotBound founder-fleet escalation policy/backtesting helper", () => {
  it.each([20, 50, 1_000])(
    "routes a $%s support refund request to authorized billing review",
    (requestedRefundAmount) => {
      const decision = evaluateEscalation({
        ...createInitialState("support"),
        requestedRefundAmount,
      });

      expect(decision.rule_id).toBe("refund_review_required");
      expect(decision.action).toBe("create_support_ticket");
      expect(decision.message_to_caller).toContain("billing review workflow");
      expect(decision.message_to_caller).not.toMatch(/approved|issued|refunded/i);
    },
  );

  it.each(["please refund this charge", "I want my money back"])(
    "routes an amountless refund request from the caller's words: %s",
    (request) => {
      const decision = evaluateEscalation({
        ...createInitialState("support"),
        transcript: request,
        latestUtterance: request,
      });

      expect(decision).toMatchObject({
        rule_id: "refund_review_required",
        action: "create_support_ticket",
      });
      expect(decision.message_to_caller).not.toMatch(/recorded.*invoice details/i);
    },
  );

  it("answers a money-back policy question without creating a refund ticket", () => {
    const decision = evaluateEscalation({
      ...createInitialState("support"),
      transcript: "What is your money back policy?",
      latestUtterance: "What is your money back policy?",
    });

    expect(decision).toMatchObject({ rule_id: null, action: "ai_handles" });
  });

  it("does not infer a refund workflow without a support refund request", () => {
    expect(evaluateEscalation(createInitialState("support"))).toMatchObject({
      rule_id: null,
      action: "ai_handles",
    });

    expect(
      evaluateEscalation({
        ...createInitialState("sales"),
        requestedRefundAmount: 25,
      }),
    ).toMatchObject({ rule_id: null, action: "ai_handles" });
  });

  it("keeps an explicit human request ahead of the billing-review queue", () => {
    const decision = evaluateEscalation({
      ...createInitialState("support"),
      transcript: "I want to speak to a human",
      latestUtterance: "I want to speak to a human",
      requestedRefundAmount: 25,
    });

    expect(decision.rule_id).toBe("explicit_human_request");
    expect(decision.action).toBe("transfer_to_owner");
  });

  it("does not promise a human connection before the transfer tool confirms it", () => {
    const transferCopy = WIRELINE_ESCALATION_RULES.filter(
      (rule) => rule.action === "transfer_to_owner",
    )
      .map((rule) => rule.message_to_caller)
      .join("\n");

    expect(transferCopy).toContain("configured human handoff");
    expect(transferCopy).not.toMatch(/connect you|get (?:a )?human on the line/i);
  });

  it("routes owner follow-up without inventing response-time promises", () => {
    const enterprise = evaluateEscalation({
      ...createInitialState("sales"),
      transcript: "We need an enterprise deployment across multiple locations",
      latestUtterance: "We need an enterprise deployment across multiple locations",
    });
    const frustrated = evaluateEscalation({
      ...createInitialState("support"),
      sentimentHistory: ["frustrated", "frustrated"],
    });

    expect(enterprise.rule_id).toBe("hot_enterprise_lead");
    expect(frustrated.rule_id).toBe("sustained_frustration");
    expect(`${enterprise.message_to_caller} ${frustrated.message_to_caller}`).not.toMatch(
      /(?:i(?:'|’)ll|i will)\s+(?:send|text|email|notify|flag)|(?:will|can)\s+follow up|minutes?|hours?|business days?/i,
    );
  });

  it("keeps the production support-ticket tool durable and failure-honest", () => {
    const workflow = readFileSync(resolve(process.cwd(), "src/lib/bot-tools/workflow.ts"), "utf8");
    const handler = workflow.slice(
      workflow.indexOf('if (fn === "create_support_ticket")'),
      workflow.indexOf('if (fn === "leave_voicemail")'),
    );

    expect(handler).toContain(".insert(schema.followUpTasks)");
    expect(handler).toContain('status: "pending"');
    expect(handler).toContain(".returning({ id: schema.followUpTasks.id })");
    expect(handler).toContain("Support ticket #${task.id.split");
    expect(handler).toContain("it could not be recorded");
    expect(handler).not.toContain("I've noted the issue");
  });
});
