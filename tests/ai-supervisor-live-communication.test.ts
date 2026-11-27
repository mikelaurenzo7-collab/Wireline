import { beforeEach, describe, expect, it, vi } from "vitest";

const { runStructuredMock } = vi.hoisted(() => ({
  runStructuredMock: vi.fn(),
}));

vi.mock("../src/lib/ai-structured", () => ({
  runStructured: runStructuredMock,
}));

import {
  ClientCommunicationBlockedError,
  clientFacingAgentName,
  reviewOutputTokenBudget,
  superviseClientCommunication,
} from "../src/lib/ai-supervisor";

describe("live-call communication supervision", () => {
  beforeEach(() => {
    runStructuredMock.mockReset();
  });

  it("sends a safe revised message instead of treating revision as a blocked action", async () => {
    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "Your requested details",
      body: "Here are the verified details we discussed.",
      rationale: "Removed an unsupported delivery promise.",
    });

    await expect(
      superviseClientCommunication({
        channel: "email",
        agentName: "Avery",
        source: "voice_tool",
        purpose: "caller-requested follow-up",
        recipient: "caller@example.com",
        subject: "Details",
        body: "Here are the details. We guarantee delivery tomorrow.",
      }),
    ).resolves.toEqual({
      approved: true,
      subject: "Your requested details",
      body: "Here are the verified details we discussed.",
      rationale: "Removed an unsupported delivery promise.",
    });
  });

  it("blocks a communication that cannot be safely repaired", async () => {
    runStructuredMock.mockResolvedValue({
      approved: false,
      subject: "",
      body: "",
      rationale: "The agent lacks authority to make this commitment.",
    });

    await expect(
      superviseClientCommunication({
        channel: "email",
        source: "voice_tool",
        purpose: "live call follow-up",
        recipient: "caller@example.com",
        body: "We approve your refund and guarantee payment today.",
      }),
    ).rejects.toThrow(ClientCommunicationBlockedError);
  });

  it("requires a valid confirmed email before invoking the reviewer", async () => {
    await expect(
      superviseClientCommunication({
        channel: "email",
        source: "voice_tool",
        purpose: "live call follow-up",
        recipient: "caller at example dot com",
        body: "Here is the link you requested.",
      }),
    ).rejects.toThrow("valid confirmed email address");
    expect(runStructuredMock).not.toHaveBeenCalled();
  });

  it("keeps internal identifiers out of reviewer context and fallback subjects", async () => {
    expect(clientFacingAgentName("agent-0123456789abcdef")).toBe("");
    expect(clientFacingAgentName("11111111-1111-1111-1111-111111111111")).toBe("");
    expect(clientFacingAgentName("Avery")).toBe("Avery");
    expect(clientFacingAgentName("A".repeat(120))).toHaveLength(80);

    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "",
      body: "Here is the link you requested.",
      rationale: "Approved.",
    });

    await expect(
      superviseClientCommunication({
        channel: "email",
        agentName: "agent-0123456789abcdef",
        source: "voice_tool",
        purpose: "live call follow-up",
        recipient: "caller@example.com",
        body: "Here is the link you requested.",
      }),
    ).resolves.toMatchObject({ subject: "Follow-up" });

    const user = runStructuredMock.mock.calls[0][0].user as string;
    expect(user).toContain("Agent: the business's Bot");
    expect(user).not.toContain("agent-0123456789abcdef");
    expect(user).not.toContain("BotBound");
  });

  it("writes as the business: its name leads the fallback subject, never the platform's", async () => {
    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "",
      body: "Here is the quote you asked for.",
      rationale: "Approved.",
    });

    await expect(
      superviseClientCommunication({
        channel: "email",
        agentName: "Avery",
        businessName: "Riverside Plumbing",
        source: "action_engine",
        purpose: "post-call follow-up",
        recipient: "caller@example.com",
        body: "Here is the quote you asked for.",
      }),
    ).resolves.toMatchObject({ subject: "Follow-up from Riverside Plumbing" });

    const request = runStructuredMock.mock.calls[0][0];
    expect(request.user).toContain("Business: Riverside Plumbing\nAgent: Avery");
    expect(request.system).toContain("do not add a signature or sign-off");
    expect(request.system).toContain("not by BotBound");
  });

  it("sizes the reviewer's output to the message it must return", async () => {
    expect(reviewOutputTokenBudget("", "short")).toBe(1500);
    // A 12,000-character email needs about 4,000 tokens echoed back; the old
    // fixed 1,200-token cap truncated it into unparseable output.
    expect(reviewOutputTokenBudget("Quote", "x".repeat(12_000))).toBe(4802);
    expect(reviewOutputTokenBudget("", "x".repeat(40_000))).toBe(6000);

    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "Quote",
      body: "x".repeat(9_000),
      rationale: "Approved.",
    });
    await superviseClientCommunication({
      channel: "email",
      source: "action_engine",
      purpose: "post-call follow-up",
      recipient: "caller@example.com",
      subject: "Quote",
      body: "x".repeat(9_000),
    });
    expect(runStructuredMock.mock.calls[0][0].maxTokens).toBe(
      reviewOutputTokenBudget("Quote", "x".repeat(9_000)),
    );
  });
});

/**
 * A Bot on Auto sends on its own, and the review that reads every message
 * also decides whether the owner would want a say before it goes.
 */
describe("the review decides when the owner would want a say", () => {
  const refund = {
    channel: "sms" as const,
    source: "voice_tool",
    purpose: "client text follow-up requested during a live call",
    recipient: "+17735550100",
    body: "No problem, we will refund the full $240 today.",
  };

  beforeEach(() => {
    runStructuredMock.mockReset();
  });

  it("is only asked for that decision when the caller of the review requests it", async () => {
    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "",
      body: "We are at 12 Main St.",
      rationale: "Routine.",
      // A model that volunteers the field is ignored unless it was asked.
      needs_owner: true,
      owner_reason: "Unasked.",
    });
    const plain = await superviseClientCommunication({ ...refund, body: "We are at 12 Main St." });
    expect(plain).toEqual({
      approved: true,
      subject: "",
      body: "We are at 12 Main St.",
      rationale: "Routine.",
    });
    const request = runStructuredMock.mock.calls[0][0];
    expect(request.system).not.toContain("needs_owner");
    expect(request.user).not.toContain("check-first rules");
    expect(request.tool.input_schema.required).toEqual([
      "approved",
      "subject",
      "body",
      "rationale",
    ]);
  });

  it("gives the review the owner's rules and a short list of reasons to ask", async () => {
    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "",
      body: "We are at 12 Main St.",
      rationale: "Routine.",
      needs_owner: false,
      owner_reason: "",
    });
    const routine = await superviseClientCommunication({
      ...refund,
      body: "We are at 12 Main St.",
      ownerDecision: { rules: ["  A customer asks   for a refund ", "", "A quote over $500"] },
    });
    // A routine message goes, reviewed as before.
    expect(routine).toEqual({
      approved: true,
      subject: "",
      body: "We are at 12 Main St.",
      rationale: "Routine.",
    });
    const request = runStructuredMock.mock.calls[0][0];
    expect(request.user).toContain(
      "Owner's check-first rules:\n- A customer asks for a refund\n- A quote over $500",
    );
    expect(request.tool.input_schema.required).toEqual([
      "approved",
      "subject",
      "body",
      "rationale",
      "needs_owner",
      "owner_reason",
    ]);
    // The default is to send: the list of reasons is short and named.
    expect(request.system).toContain("wants to be asked only when it matters");
    expect(request.system).toContain("a discount, a refund or credit");
    expect(request.system).toContain("a complaint, a disputed charge");
    expect(request.system).toContain("When in doubt between routine and not, it is routine.");
    // The original safety review is still the first thing it is told.
    expect(request.system.startsWith("You are BotBound's outbound communications safety")).toBe(
      true,
    );

    // With no rules from the owner, the review still decides on its own list.
    await superviseClientCommunication({ ...refund, ownerDecision: { rules: [] } });
    expect(runStructuredMock.mock.calls[1][0].user).toContain("Owner's check-first rules:\nNone");
  });

  it("returns the message as the Bot wrote it, with what the owner has to decide", async () => {
    runStructuredMock.mockResolvedValue({
      approved: true,
      subject: "",
      // The review must not hand back a version with the decision stripped out.
      body: "No problem.",
      rationale: "Refund needs the owner.",
      needs_owner: true,
      owner_reason: "  This promises a $240 refund.   Confirm you want to give it. ",
    });
    await expect(
      superviseClientCommunication({ ...refund, ownerDecision: { rules: [] } }),
    ).resolves.toEqual({
      approved: false,
      subject: "",
      body: refund.body,
      rationale: "Refund needs the owner.",
      ownerDecision: "This promises a $240 refund. Confirm you want to give it.",
    });
  });

  it("holds rather than blocks when the review would have done both", async () => {
    // Holding sends nothing, so it is always safe, and the owner sees the
    // message instead of an unexplained refusal.
    runStructuredMock.mockResolvedValue({
      approved: false,
      subject: "",
      body: "",
      rationale: "The assistant lacks authority to make this commitment.",
      needs_owner: true,
      owner_reason: "",
    });
    const held = await superviseClientCommunication({ ...refund, ownerDecision: { rules: [] } });
    expect(held.approved).toBe(false);
    expect(held.body).toBe(refund.body);
    // A missing reason never leaves the owner with a blank.
    expect(held.ownerDecision).toBe(
      "Your Bot was not sure you would want this sent without seeing it.",
    );
  });

  it("still blocks a message that is unsafe and that the owner was not asked about", async () => {
    runStructuredMock.mockResolvedValue({
      approved: false,
      subject: "",
      body: "",
      rationale: "Contains another customer's details.",
      needs_owner: false,
      owner_reason: "",
    });
    await expect(
      superviseClientCommunication({ ...refund, ownerDecision: { rules: [] } }),
    ).rejects.toThrow("Contains another customer's details.");
  });
});
