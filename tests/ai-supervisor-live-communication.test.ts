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
