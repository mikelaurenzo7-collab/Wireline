import { describe, expect, it, vi } from "vitest";
import { handleSendPaymentLink, handleSendSignupLink } from "./vapi-tool-handlers";

const log = {
  error: vi.fn(),
  info: vi.fn(),
};

describe("handleSendPaymentLink", () => {
  it("requires email_confirmed before sending", async () => {
    const sendPaymentLinkEmail = vi.fn();
    const { result } = await handleSendPaymentLink(
      { to_email: "dad@example.com", email_confirmed: false },
      { sendPaymentLinkEmail, log },
    );
    expect(sendPaymentLinkEmail).not.toHaveBeenCalled();
    expect(result).toMatch(/confirm/i);
  });

  it("returns DELIVERY_OK when Resend accepts", async () => {
    const sendPaymentLinkEmail = vi.fn().mockResolvedValue({ ok: true, id: "re_1" });
    const { result } = await handleSendPaymentLink(
      { to_email: "dad@example.com", email_confirmed: true, plan: "growth" },
      { sendPaymentLinkEmail, log },
    );
    expect(sendPaymentLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "dad@example.com",
        planLabel: "growth",
        payUrl: expect.stringContaining("/billing?plan=growth"),
      }),
    );
    expect(result).toMatch(/^DELIVERY_OK:/);
  });

  it("returns DELIVERY_FAILED when transport rejects", async () => {
    const sendPaymentLinkEmail = vi.fn().mockResolvedValue({
      ok: false,
      error: "Resend 403: domain not verified",
    });
    const { result } = await handleSendPaymentLink(
      { to_email: "dad@example.com", email_confirmed: true },
      { sendPaymentLinkEmail, log },
    );
    expect(result).toMatch(/^DELIVERY_FAILED:/);
    expect(result).toMatch(/billing/);
    expect(log.error).toHaveBeenCalled();
  });
});

describe("handleSendSignupLink", () => {
  it("accepts email_confirmed as string true from the LLM", async () => {
    const sendSignupLinkEmail = vi.fn().mockResolvedValue({ ok: true, id: "re_2" });
    const { result } = await handleSendSignupLink(
      { to_email: "dad@example.com", email_confirmed: "true", caller_name: "Mike" },
      { sendSignupLinkEmail, agentName: "Sarah", log },
    );
    expect(sendSignupLinkEmail).toHaveBeenCalled();
    expect(result).toMatch(/^DELIVERY_OK:/);
  });
});
