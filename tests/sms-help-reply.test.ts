import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            throw new Error("database unavailable");
          },
        }),
      }),
    }),
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loadSmsHelpIdentity, smsHelpReplyText } from "../src/lib/sms-help-reply";

describe("SMS HELP reply", () => {
  it("names the line owner's brand and support contact", () => {
    expect(
      smsHelpReplyText({ brandName: "Ridge Inspections", supportEmail: "help@ridge.example" }),
    ).toBe(
      "Ridge Inspections SMS help: reply STOP to opt out or START to opt back in. Contact help@ridge.example for support. Message and data rates may apply.",
    );
  });

  it("keeps BotBound's platform wording without saved identity details", () => {
    expect(smsHelpReplyText()).toBe(
      "BotBound SMS help: reply STOP to opt out or START to opt back in. Contact support@botbound.app for support. Message and data rates may apply.",
    );
    expect(smsHelpReplyText({ brandName: "Ridge", supportEmail: "not-an-email" })).toContain(
      "Contact support@botbound.app for support.",
    );
  });

  it("falls back to platform wording when identity cannot be read", async () => {
    await expect(loadSmsHelpIdentity("tenant-1")).resolves.toEqual({
      brandName: null,
      supportEmail: null,
    });
  });
});
