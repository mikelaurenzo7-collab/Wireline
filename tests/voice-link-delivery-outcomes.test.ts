import { describe, expect, it, vi } from "vitest";
import {
  handleSendPaymentLink,
  handleSendSignupLink,
  type AgentLinkSendResult,
} from "../src/lib/agent-link-tool-handlers";
import { isToolCallFailureResult } from "../src/lib/call-reliability-capture";
import { enforceAgentToolResultTruth } from "../src/lib/agent-tool-result-truth";

vi.mock("../src/lib/server-context", () => ({ drizzle: {}, log: { warn: vi.fn() } }));

describe.each(["payment", "signup"] as const)("voice %s link delivery truth", (kind) => {
  const execute = (
    args: { to_email?: string; email_confirmed?: boolean; plan?: string },
    send: () => Promise<AgentLinkSendResult>,
  ) => {
    const common = { appUrl: "https://botbound.app", log: { error: vi.fn(), info: vi.fn() } };
    return kind === "payment"
      ? handleSendPaymentLink(args, { ...common, sendPaymentLinkEmail: send })
      : handleSendSignupLink(args, { ...common, sendSignupLinkEmail: send });
  };
  const args = { to_email: "confirmed@example.test", email_confirmed: true, plan: "voice" };

  it("uses the live BotBound page when no custom app URL is configured", async () => {
    vi.stubEnv("APP_URL", "");
    try {
      const send = async () => {
        throw new Error("Provider unavailable");
      };
      const log = { error: vi.fn() };
      const output =
        kind === "payment"
          ? await handleSendPaymentLink(args, { sendPaymentLinkEmail: send, log })
          : await handleSendSignupLink(args, { sendSignupLinkEmail: send, log });
      expect(output.result).toContain(
        `https://botbound.app/${kind === "payment" ? "pricing" : "signup"}`,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports provider acceptance as submitted without inbox or timing guarantees", async () => {
    const send = vi.fn(async () => ({ ok: true, id: "accepted-message" }));
    const output = await execute(args, send);
    expect(send).toHaveBeenCalledOnce();
    expect(output.result).toMatch(/^SUBMISSION_OK:/);
    expect(output.result).toContain("submitted to confirmed@example.test");
    expect(output.result).toContain("Inbox delivery has not been verified.");
    expect(output.result).not.toMatch(/DELIVERY_OK|within a minute|should arrive/);
    expect(isToolCallFailureResult(output.result)).toBe(false);
    const result = { toolCallId: "link", ...output };
    expect(enforceAgentToolResultTruth(`send_${kind}_link`, result)).toEqual(result);
  });

  it.each([false, true])(
    "preserves uncertainty and offers the URL after a thrown=%s provider failure",
    async (throws) => {
      const send = vi.fn(async () => {
        if (throws) throw new Error("Provider connection interrupted");
        return { ok: false, error: "Provider connection interrupted" };
      });
      const output = await execute(args, send);
      expect(send).toHaveBeenCalledOnce();
      expect(output.result).toMatch(/^DELIVERY_FAILED:/);
      expect(output.result).toContain("submission was not confirmed");
      expect(output.result).toContain("Do not claim it was sent or automatically retry.");
      expect(output.result).toContain(
        `https://botbound.app/${kind === "payment" ? "pricing" : "signup"}`,
      );
      expect(output.result).not.toContain("No email was sent");
      expect(output.result).not.toContain("Provider connection interrupted");
      expect(isToolCallFailureResult(output.result)).toBe(true);
    },
  );

  it.each([
    { to_email: "not-an-address", email_confirmed: true },
    { to_email: args.to_email, email_confirmed: false },
  ])("keeps invalid/unconfirmed recipients out of the transport: %j", async (input) => {
    const send = vi.fn(async () => ({ ok: true }));
    const output = await execute(input, send);
    expect(output.result).toMatch(/^DELIVERY_FAILED: No email was sent\./);
    expect(isToolCallFailureResult(output.result)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
});
