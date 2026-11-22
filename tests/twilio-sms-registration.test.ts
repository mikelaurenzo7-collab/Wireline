import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/twilio-service-base", () => ({ getTwilioClient: () => null }));

import {
  classifySmsSender,
  readSmsRegistrationSnapshot,
  resetSmsRegistrationCache,
  resolveSmsSenderRegistration,
  smsSenderKind,
  type SmsRegistrationClient,
} from "../src/lib/twilio-sms-registration";
import {
  composeFirstContactSmsBody,
  firstContactSenderName,
  FIRST_CONTACT_OPT_OUT,
} from "../src/lib/sms-first-contact";

const LOCAL_REGISTERED = "+13125550101";
const LOCAL_POOLED_NO_CAMPAIGN = "+13125550102";
const LOCAL_UNPOOLED = "+13125550103";
const LOCAL_PENDING = "+13125550104";
const TOLL_FREE_APPROVED = "+18885550101";
const TOLL_FREE_IN_REVIEW = "+18445550102";
const TOLL_FREE_REJECTED = "+18555550103";
const TOLL_FREE_NONE = "+18775550104";

function fakeClient(overrides: { failServices?: boolean } = {}) {
  const calls = { services: 0 };
  const numbers = [
    LOCAL_REGISTERED,
    LOCAL_POOLED_NO_CAMPAIGN,
    LOCAL_UNPOOLED,
    LOCAL_PENDING,
    TOLL_FREE_APPROVED,
    TOLL_FREE_IN_REVIEW,
    TOLL_FREE_REJECTED,
    TOLL_FREE_NONE,
  ].map((phoneNumber, index) => ({ sid: `PN${index}`, phoneNumber }));
  const pools: Record<string, { senders: string[]; campaigns: string[] }> = {
    MGapproved: { senders: [LOCAL_REGISTERED, TOLL_FREE_APPROVED], campaigns: ["VERIFIED"] },
    MGmarketing: { senders: [LOCAL_POOLED_NO_CAMPAIGN], campaigns: [] },
    MGpending: { senders: [LOCAL_PENDING], campaigns: ["IN_PROGRESS"] },
  };
  const services = Object.assign(
    (sid: string) => ({
      phoneNumbers: {
        list: async () => pools[sid].senders.map((phoneNumber) => ({ phoneNumber })),
      },
      usAppToPerson: {
        list: async () => pools[sid].campaigns.map((campaignStatus) => ({ campaignStatus })),
      },
    }),
    {
      list: async () => {
        calls.services += 1;
        if (overrides.failServices) throw new Error("twilio unavailable");
        return Object.keys(pools).map((sid) => ({ sid }));
      },
    },
  );
  const client: SmsRegistrationClient = {
    incomingPhoneNumbers: { list: async () => numbers },
    messaging: {
      v1: {
        services,
        tollfreeVerifications: {
          list: async () => [
            { tollfreePhoneNumberSid: "PN4", status: "TWILIO_REJECTED" },
            { tollfreePhoneNumberSid: "PN4", status: "TWILIO_APPROVED" },
            { tollfreePhoneNumberSid: "PN5", status: "IN_REVIEW" },
            { tollfreePhoneNumberSid: "PN6", status: "TWILIO_REJECTED" },
          ],
        },
      },
    },
  };
  return { client, calls };
}

describe("SMS sender registration", () => {
  beforeEach(() => resetSmsRegistrationCache());

  it("separates local 10DLC, toll-free and non-US senders", () => {
    expect(smsSenderKind(LOCAL_REGISTERED)).toBe("local_10dlc");
    expect(smsSenderKind(TOLL_FREE_APPROVED)).toBe("toll_free");
    expect(smsSenderKind("+442071838750")).toBeNull();
  });

  it("classifies every sender state from one account snapshot", async () => {
    const snapshot = await readSmsRegistrationSnapshot(fakeClient().client, 0);

    expect(classifySmsSender(LOCAL_REGISTERED, snapshot)).toEqual({
      status: "registered",
      kind: "local_10dlc",
      messagingServiceSid: "MGapproved",
    });
    expect(classifySmsSender(LOCAL_POOLED_NO_CAMPAIGN, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
    });
    expect(classifySmsSender(LOCAL_UNPOOLED, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
    });
    expect(classifySmsSender(LOCAL_PENDING, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_REGISTRATION_PENDING",
    });
    // A rejected earlier submission does not outweigh a later approval.
    expect(classifySmsSender(TOLL_FREE_APPROVED, snapshot)).toEqual({
      status: "registered",
      kind: "toll_free",
      messagingServiceSid: "MGapproved",
    });
    expect(classifySmsSender(TOLL_FREE_IN_REVIEW, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_REGISTRATION_PENDING",
    });
    expect(classifySmsSender(TOLL_FREE_REJECTED, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
    });
    expect(classifySmsSender(TOLL_FREE_NONE, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
    });
    expect(classifySmsSender("+18005550199", snapshot)).toMatchObject({ status: "unknown" });
  });

  it("treats an unfamiliar campaign state as unknown rather than blocking", async () => {
    const snapshot = await readSmsRegistrationSnapshot(fakeClient().client, 0);
    snapshot.pools.set(LOCAL_UNPOOLED, [
      { serviceSid: "MGnew", campaignStatuses: ["SOME_FUTURE_STATE"] },
    ]);
    expect(classifySmsSender(LOCAL_UNPOOLED, snapshot)).toMatchObject({ status: "unknown" });
  });

  it("caches the account snapshot and never invents registration on a failed read", async () => {
    const healthy = fakeClient();
    await resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: healthy.client, nowMs: 1_000 });
    await resolveSmsSenderRegistration(LOCAL_UNPOOLED, { client: healthy.client, nowMs: 2_000 });
    expect(healthy.calls.services).toBe(1);

    resetSmsRegistrationCache();
    const failing = fakeClient({ failServices: true });
    await expect(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: failing.client, nowMs: 3_000 }),
    ).resolves.toMatchObject({ status: "unknown" });
  });

  it("keeps a recent good snapshot through a transient read failure", async () => {
    const healthy = fakeClient();
    await resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: healthy.client, nowMs: 0 });
    const failing = fakeClient({ failServices: true });
    await expect(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, {
        client: failing.client,
        nowMs: 11 * 60_000,
      }),
    ).resolves.toMatchObject({ status: "registered", messagingServiceSid: "MGapproved" });
  });

  it("returns unknown without a readable carrier client", async () => {
    await expect(resolveSmsSenderRegistration(LOCAL_REGISTERED)).resolves.toMatchObject({
      status: "unknown",
      kind: "local_10dlc",
    });
  });
});

describe("first-contact SMS composition", () => {
  it("prefers the brand name, then the business name", () => {
    expect(firstContactSenderName({ brandName: " BotBound ", businessName: "BOTBOUND LLC" })).toBe(
      "BotBound",
    );
    expect(firstContactSenderName({ brandName: "", businessName: "Ridge  Inspections" })).toBe(
      "Ridge Inspections",
    );
    expect(firstContactSenderName({})).toBeNull();
  });

  it("names the sender and adds opt-out language once", () => {
    expect(
      composeFirstContactSmsBody({ body: "Your visit is confirmed.", senderName: "BotBound" }),
    ).toBe(`BotBound: Your visit is confirmed. ${FIRST_CONTACT_OPT_OUT}`);
    expect(
      composeFirstContactSmsBody({
        body: "BotBound here: your visit is confirmed. Reply STOP to unsubscribe.",
        senderName: "BotBound",
      }),
    ).toBe("BotBound here: your visit is confirmed. Reply STOP to unsubscribe.");
  });

  it("does not mistake an ordinary lowercase stop for opt-out language", () => {
    expect(composeFirstContactSmsBody({ body: "Feel free to stop by Tuesday." })).toBe(
      `Feel free to stop by Tuesday. ${FIRST_CONTACT_OPT_OUT}`,
    );
  });
});
