import { beforeEach, describe, expect, it, vi } from "vitest";

const { runStructuredMock } = vi.hoisted(() => ({
  runStructuredMock: vi.fn(),
}));

vi.mock("../src/lib/ai-structured", () => ({
  runStructured: runStructuredMock,
}));

import {
  ClientCommunicationBlockedError,
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
});
