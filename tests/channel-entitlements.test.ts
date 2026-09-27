import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  row: undefined as undefined | { email: string; plan: string | null; status: string | null },
  error: false,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => {
      const query = {
        from: () => query,
        leftJoin: () => query,
        where: () => query,
        limit: async () => {
          if (h.error) throw new Error("database unavailable");
          return h.row ? [h.row] : [];
        },
      };
      return query;
    },
  },
}));
vi.mock("../src/lib/platform-owner-emails", () => ({
  isOwnerEmail: (email: string) => email === "owner@example.test",
}));
import {
  getTenantChannelEntitlements,
  requireTenantChannel,
  requireTenantPhoneChannel,
} from "../src/lib/channel-entitlements";
beforeEach(() => {
  h.error = false;
  h.row = { email: "pilot@example.test", plan: "voice", status: "active" };
});

describe("server channel entitlement authority", () => {
  it.each([
    ["voice", ["voice"]],
    ["email", ["email"]],
    ["sms", ["sms"]],
    ["voice-email", ["voice", "email"]],
    ["voice-sms", ["voice", "sms"]],
    ["email-sms", ["email", "sms"]],
    ["omnichannel", ["voice", "email", "sms"]],
  ])("resolves exact %s capabilities", async (plan, channels) => {
    h.row!.plan = plan as string;
    expect((await getTenantChannelEntitlements("pilot")).channels).toEqual(channels);
  });
  it.each(["canceled", "past_due", "pending_activation"])(
    "denies %s subscriptions",
    async (status) => {
      h.row!.status = status;
      await expect(requireTenantChannel("pilot", "voice")).rejects.toMatchObject({
        status: 402,
        code: "CHANNEL_NOT_INCLUDED",
      });
    },
  );
  it("denies unknown and missing plans even with a paid status", async () => {
    h.row!.plan = "unknown";
    expect((await getTenantChannelEntitlements("pilot")).channels).toEqual([]);
    h.row = undefined;
    expect((await getTenantChannelEntitlements("pilot")).channels).toEqual([]);
  });
  it("does not allocate a phone to Email-only and keeps other exclusions explicit", async () => {
    h.row!.plan = "email";
    await expect(requireTenantPhoneChannel("pilot")).rejects.toMatchObject({
      code: "CHANNEL_NOT_INCLUDED",
    });
    await expect(requireTenantChannel("pilot", "sms")).rejects.toMatchObject({
      status: 402,
      details: { recovery_path: "/settings/billing" },
    });
  });
  it("recognizes only the server-read owner identity", async () => {
    h.row = { email: "owner@example.test", plan: null, status: null };
    expect(await getTenantChannelEntitlements("owner")).toMatchObject({
      planId: "enterprise",
      isOwner: true,
      channels: ["voice", "email", "sms"],
    });
  });
  it("returns retryable failure when authority cannot be read", async () => {
    h.error = true;
    await expect(requireTenantChannel("pilot", "voice")).rejects.toMatchObject({ status: 503 });
  });
});
