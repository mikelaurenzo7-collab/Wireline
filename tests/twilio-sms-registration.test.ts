import twilio from "twilio";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/twilio-service-base", () => ({ getTwilioClient: () => null }));

import {
  INBOUND_REPLY_COVERAGE,
  classifySmsSender,
  readSmsRegistrationSnapshot,
  resetSmsRegistrationCache,
  resolveSmsSenderRegistration,
  smsSenderKind,
  type SmsRegistrationClient,
  type SmsRegistrationListOptions,
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
      coversMissedCalls: false,
      coversInboundReplies: false,
    });
    // In a Messaging Service with no campaign yet: carrier:register attaches
    // the line before the campaign exists, so this is registration underway.
    expect(classifySmsSender(LOCAL_POOLED_NO_CAMPAIGN, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_REGISTRATION_PENDING",
      reason: expect.stringContaining("registration has started"),
    });
    expect(classifySmsSender(LOCAL_UNPOOLED, snapshot)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
      reason: expect.stringContaining("Add your business details"),
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

  it("records whether the approved campaign describes missed-call texts", async () => {
    const { client } = fakeClient();
    const campaignList = client.messaging.v1.services;
    const services = Object.assign(
      (sid: string) => {
        const context = campaignList(sid);
        return sid === "MGapproved"
          ? {
              ...context,
              usAppToPerson: {
                list: async () => [
                  {
                    campaignStatus: "VERIFIED",
                    description: "Customer care texts.",
                    messageFlow: "If a caller's call is missed, the business may send one text.",
                  },
                ],
              },
            }
          : context;
      },
      { list: campaignList.list },
    );
    const snapshot = await readSmsRegistrationSnapshot(
      { ...client, messaging: { v1: { ...client.messaging.v1, services } } },
      0,
    );
    expect(classifySmsSender(LOCAL_REGISTERED, snapshot)).toMatchObject({
      status: "registered",
      coversMissedCalls: true,
      coversInboundReplies: false,
    });
  });

  it("reads inbound reply coverage only from a verified campaign on the exact service", async () => {
    const { client } = fakeClient();
    const campaignList = client.messaging.v1.services;
    const services = Object.assign(
      (sid: string) => {
        const context = campaignList(sid);
        return sid === "MGapproved"
          ? {
              ...context,
              usAppToPerson: {
                list: async () => [
                  { campaignStatus: "FAILED", description: "Customers text us for support." },
                  { campaignStatus: "VERIFIED", description: "Customers text us for support." },
                ],
              },
            }
          : context;
      },
      { list: campaignList.list },
    );
    const snapshot = await readSmsRegistrationSnapshot(
      { ...client, messaging: { v1: { ...client.messaging.v1, services } } },
      0,
    );
    expect(classifySmsSender(LOCAL_REGISTERED, snapshot)).toMatchObject({
      status: "registered",
      coversInboundReplies: true,
    });
    expect(classifySmsSender(LOCAL_PENDING, snapshot)).toMatchObject({
      status: "unregistered",
    });
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

  it("tells an owner whose campaign failed to contact support, not to add details again", () => {
    const failed = "+13125550105";
    const snapshot = {
      readAtMs: 0,
      numberSids: new Map([[failed, "PNfailed"]]),
      pools: new Map([
        [
          failed,
          [{ serviceSid: "MGfailed", campaignStatuses: ["FAILED"], coversMissedCalls: false }],
        ],
      ]),
      tollFree: new Map(),
    };
    expect(classifySmsSender(failed, snapshot as never)).toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
      reason: expect.stringContaining("wasn't approved"),
    });
  });

  it("treats a line the snapshot never saw as unknown, never as unregistered", async () => {
    const healthy = fakeClient();
    await expect(
      resolveSmsSenderRegistration("+13125550199", { client: healthy.client, nowMs: 1_000 }),
    ).resolves.toMatchObject({ status: "unknown", kind: "local_10dlc" });
  });

  it("re-checks a refusal against a fresh read once the snapshot is a minute old", async () => {
    const healthy = fakeClient();
    await resolveSmsSenderRegistration(LOCAL_UNPOOLED, { client: healthy.client, nowMs: 0 });
    await resolveSmsSenderRegistration(LOCAL_UNPOOLED, { client: healthy.client, nowMs: 30_000 });
    expect(healthy.calls.services).toBe(1);
    await resolveSmsSenderRegistration(LOCAL_UNPOOLED, { client: healthy.client, nowMs: 61_000 });
    expect(healthy.calls.services).toBe(2);
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

describe("inbound automation campaign coverage", () => {
  it("does not treat call-requested texts as an approved inbound reply program", () => {
    expect(
      INBOUND_REPLY_COVERAGE.test(
        "During a customer-care call, the customer asks for a text. After verbal permission we send the requested information.",
      ),
    ).toBe(false);
    expect(
      INBOUND_REPLY_COVERAGE.test(
        "Customers text us for support after seeing the published number and consent disclosures. The Bot automatically replies to incoming customer texts.",
      ),
    ).toBe(true);
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

describe("registration snapshot paging", () => {
  it("asks Twilio for pages of at most 50 on every list", async () => {
    const seen: Array<{ list: string; limit: number; pageSize: number }> = [];
    const record =
      <T>(list: string, rows: T[]) =>
      async (options: { limit: number; pageSize: number }) => {
        seen.push({ list, ...options });
        return rows;
      };
    const client: SmsRegistrationClient = {
      incomingPhoneNumbers: {
        list: record("incomingPhoneNumbers", [{ sid: "PN0", phoneNumber: LOCAL_REGISTERED }]),
      },
      messaging: {
        v1: {
          services: Object.assign(
            () => ({
              phoneNumbers: {
                list: record("services.phoneNumbers", [{ phoneNumber: LOCAL_REGISTERED }]),
              },
              usAppToPerson: {
                list: record("services.usAppToPerson", [{ campaignStatus: "VERIFIED" }]),
              },
            }),
            { list: record("services", [{ sid: "MGapproved" }]) },
          ),
          tollfreeVerifications: { list: record("tollfreeVerifications", []) },
        },
      },
    };

    const snapshot = await readSmsRegistrationSnapshot(client, 1_000);

    expect(classifySmsSender(LOCAL_REGISTERED, snapshot).status).toBe("registered");
    expect(seen.map((call) => call.list).sort()).toEqual([
      "incomingPhoneNumbers",
      "services",
      "services.phoneNumbers",
      "services.usAppToPerson",
      "tollfreeVerifications",
    ]);
    for (const call of seen) {
      expect(call.pageSize, call.list).toBeGreaterThanOrEqual(1);
      expect(call.pageSize, call.list).toBeLessThanOrEqual(50);
      expect(call.limit, call.list).toBeGreaterThanOrEqual(call.pageSize);
    }
  });

  it("hands every list call an options object of its own", async () => {
    const handed: SmsRegistrationListOptions[] = [];
    // The SDK writes each call's callbacks onto the options it is given.
    const sdkLike =
      <T>(rows: T[]) =>
      async (options: SmsRegistrationListOptions) => {
        handed.push(options);
        Object.assign(options, { callback: () => undefined, done: () => undefined });
        return rows;
      };
    const client: SmsRegistrationClient = {
      incomingPhoneNumbers: { list: sdkLike([{ sid: "PN0", phoneNumber: LOCAL_REGISTERED }]) },
      messaging: {
        v1: {
          services: Object.assign(
            () => ({
              phoneNumbers: { list: sdkLike([{ phoneNumber: LOCAL_REGISTERED }]) },
              usAppToPerson: { list: sdkLike([{ campaignStatus: "VERIFIED" }]) },
            }),
            { list: sdkLike([{ sid: "MGapproved" }]) },
          ),
          tollfreeVerifications: { list: sdkLike([]) },
        },
      },
    };

    await Promise.all([
      readSmsRegistrationSnapshot(client, 0),
      readSmsRegistrationSnapshot(client, 0),
    ]);

    expect(handed).toHaveLength(10);
    expect(new Set(handed).size).toBe(10);
  });
});

describe("registration read through the carrier SDK itself", () => {
  const ACCOUNT_SID = `AC${"0".repeat(32)}`;
  const SERVICE_SID = `MG${"b".repeat(32)}`;

  beforeEach(() => resetSmsRegistrationCache());

  /** Answers like the carrier API, a little late, so the first three lists overlap. */
  function carrierStub() {
    const requests: Array<{ uri: string; pageSize: unknown }> = [];
    const page = (key: string, rows: unknown[]) => ({
      [key]: rows,
      meta: { key, next_page_url: null, page: 0, page_size: 50 },
    });
    const httpClient = {
      request(options: { uri: string; params?: Record<string, unknown> }) {
        const uri = String(options.uri);
        requests.push({ uri, pageSize: options.params?.PageSize });
        let body: unknown = {};
        if (uri.includes("IncomingPhoneNumbers") && uri.includes("Page=1")) {
          body = {
            incoming_phone_numbers: [{ sid: "PNsecond", phone_number: LOCAL_UNPOOLED }],
            next_page_uri: null,
            page: 1,
            page_size: 50,
          };
        } else if (uri.includes("IncomingPhoneNumbers")) {
          body = {
            incoming_phone_numbers: [{ sid: "PNfirst", phone_number: LOCAL_REGISTERED }],
            next_page_uri: `/2010-04-01/Accounts/${ACCOUNT_SID}/IncomingPhoneNumbers.json?PageSize=50&Page=1&PageToken=PAtest`,
            page: 0,
            page_size: 50,
          };
        } else if (uri.includes("Tollfree/Verifications")) {
          body = page("verifications", []);
        } else if (uri.includes("/PhoneNumbers")) {
          body = page("phone_numbers", [{ sid: "PNfirst", phone_number: LOCAL_REGISTERED }]);
        } else if (uri.includes("Compliance/Usa2p")) {
          body = page("compliance", [
            {
              sid: "QEtest",
              campaign_status: "VERIFIED",
              description: "Customers text us for support.",
            },
          ]);
        } else if (uri.includes("/Services")) {
          body = page("services", [{ sid: SERVICE_SID }]);
        }
        const delayMs = uri.includes("IncomingPhoneNumbers")
          ? 5
          : uri.includes("Tollfree")
            ? 25
            : 15;
        return new Promise((resolve) => {
          setTimeout(
            () => resolve({ statusCode: 200, body: JSON.stringify(body), headers: {} }),
            delayMs,
          );
        });
      },
    };
    const client = twilio(ACCOUNT_SID, "test-token", { httpClient: httpClient as never });
    return { client, requests };
  }

  function answeredWithin<T>(work: Promise<T>, ms: number): Promise<T | "still waiting"> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<"still waiting">((resolve) => {
      timer = setTimeout(() => resolve("still waiting"), ms);
    });
    return Promise.race([work, late]).finally(() => clearTimeout(timer));
  }

  it("finishes when its lists run at the same time, and follows the next page", async () => {
    const { client, requests } = carrierStub();

    // One options object shared by the three first lists left this pending forever.
    const verdict = await answeredWithin(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, { client }),
      3_000,
    );

    expect(verdict).toEqual({
      status: "registered",
      kind: "local_10dlc",
      messagingServiceSid: SERVICE_SID,
      coversMissedCalls: false,
      coversInboundReplies: true,
    });
    // The line on the second page of numbers is known to the account, so it is refused.
    await expect(resolveSmsSenderRegistration(LOCAL_UNPOOLED, { client })).resolves.toMatchObject({
      status: "unregistered",
      code: "SMS_SENDER_UNREGISTERED",
    });
    // Numbers twice, services, toll-free, then the one service: senders and campaigns.
    expect(requests).toHaveLength(6);
    const pageSizes = requests
      .map((request) => request.pageSize)
      .filter((pageSize) => pageSize !== undefined);
    expect(pageSizes).toHaveLength(5);
    for (const pageSize of pageSizes) {
      expect(Number(pageSize)).toBeGreaterThanOrEqual(1);
      expect(Number(pageSize)).toBeLessThanOrEqual(50);
    }
  });
});

describe("a registration read that is slow or never comes back", () => {
  beforeEach(() => {
    resetSmsRegistrationCache();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetSmsRegistrationCache();
  });

  const never = () => new Promise<never>(() => undefined);

  it("stops waiting after five seconds and does not make the next send wait", async () => {
    const { client } = fakeClient();
    const stuck: SmsRegistrationClient = { ...client, incomingPhoneNumbers: { list: never } };

    const first = resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: stuck, nowMs: 0 });
    let answered = false;
    void first.then(() => {
      answered = true;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(answered).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).resolves.toMatchObject({ status: "unknown", kind: "local_10dlc" });

    // The read is still out. The next send is answered at once, with no timer to wait on.
    await expect(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: stuck, nowMs: 6_000 }),
    ).resolves.toMatchObject({ status: "unknown" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads again once a stuck read is a minute old", async () => {
    const { client, calls } = fakeClient();
    const stuck: SmsRegistrationClient = { ...client, incomingPhoneNumbers: { list: never } };

    const first = resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: stuck, nowMs: 0 });
    await vi.advanceTimersByTimeAsync(5_000);
    await first;
    await resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: stuck, nowMs: 30_000 });
    expect(calls.services).toBe(1);

    await vi.advanceTimersByTimeAsync(55_000);
    await expect(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, { client, nowMs: 60_000 }),
    ).resolves.toMatchObject({ status: "registered", messagingServiceSid: "MGapproved" });
    expect(calls.services).toBe(2);
  });

  it("keeps the result of a read that lands after its caller stopped waiting", async () => {
    const { client, calls } = fakeClient();
    const numbers = client.incomingPhoneNumbers.list;
    const slow: SmsRegistrationClient = {
      ...client,
      incomingPhoneNumbers: {
        list: (options) =>
          new Promise((resolve) => setTimeout(resolve, 8_000)).then(() => numbers(options)),
      },
    };

    const first = resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: slow, nowMs: 0 });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(first).resolves.toMatchObject({ status: "unknown" });

    await vi.advanceTimersByTimeAsync(3_000);
    await expect(
      resolveSmsSenderRegistration(LOCAL_REGISTERED, { client: slow, nowMs: 9_000 }),
    ).resolves.toMatchObject({ status: "registered", messagingServiceSid: "MGapproved" });
    expect(calls.services).toBe(1);
  });
});
