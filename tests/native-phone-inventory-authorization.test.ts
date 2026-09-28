import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  inventory: vi.fn(),
  available: vi.fn(),
  create: vi.fn(),
  owned: vi.fn(),
  claim: vi.fn(),
  retain: vi.fn(),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true, environment: "production" }),
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  requireTenantPhoneChannel: async () => ({ channels: ["voice"] }),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/app-url", () => ({ getCanonicalAppUrl: () => "https://botbound.app" }));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({
    availablePhoneNumbers: h.available,
    incomingPhoneNumbers: { create: h.create, list: h.owned },
  }),
}));
vi.mock("../src/lib/orphan-carrier-ledger", () => ({
  createPendingNativeTwilioPurchaseClaim: h.claim,
  retainNativeTwilioPurchaseClaim: h.retain,
  clearNativeTwilioPurchaseClaim: vi.fn(),
}));

import {
  listNativeAvailableLocalNumbers,
  purchaseNativeNumber,
} from "../src/lib/voice/native-phone-carrier";

const phoneNumber = "+13125550123";
const sid = `PN${"a".repeat(32)}`;
const eligible = {
  phoneNumber,
  isoCountry: "US",
  capabilities: { voice: true, sms: true },
};
const purchase = (preferredPhoneNumber = phoneNumber) =>
  purchaseNativeNumber({ userId: "tenant", preferredPhoneNumber });

beforeEach(() => {
  vi.clearAllMocks();
  h.available.mockReset().mockReturnValue({ local: { list: h.inventory } });
  h.inventory.mockReset().mockResolvedValue([eligible]);
  h.claim.mockReset().mockImplementation(async (input) => ({
    ...input,
    friendlyName: "BotBound native inventory-test",
  }));
  h.create
    .mockReset()
    .mockImplementation(async (input) => ({ phoneNumber: input.phoneNumber, sid }));
  h.owned.mockReset().mockResolvedValue([]);
  h.retain.mockReset().mockResolvedValue(undefined);
});

describe("Twilio inventory capability normalization", () => {
  it.each([
    { name: "live uppercase SMS", capabilities: { voice: true, SMS: true, MMS: true } },
    { name: "lowercase adapter compatibility", capabilities: { voice: true, sms: true } },
  ])("accepts $name for search and both purchase paths", async ({ capabilities }) => {
    h.inventory.mockResolvedValue([{ ...eligible, capabilities }]);
    await expect(listNativeAvailableLocalNumbers("tenant", "312")).resolves.toEqual([
      { phoneNumber, locality: null, region: null },
    ]);
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();

    await expect(purchase()).resolves.toMatchObject({ phoneNumber, sid });
    await expect(
      purchaseNativeNumber({ userId: "tenant", areaCode: "312" }),
    ).resolves.toMatchObject({ phoneNumber, sid });
    expect(h.inventory).toHaveBeenCalledWith({
      contains: `${phoneNumber}$`,
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
    });
    expect(h.claim).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber }));
  });

  it.each([
    { name: "missing SMS", capabilities: { voice: true, MMS: true } },
    { name: "false uppercase SMS", capabilities: { voice: true, SMS: false } },
    { name: "false lowercase SMS", capabilities: { voice: true, sms: false } },
    { name: "non-boolean SMS", capabilities: { voice: true, SMS: "true" } },
    { name: "false voice", capabilities: { voice: false, SMS: true } },
    { name: "unsupported Voice casing", capabilities: { Voice: true, SMS: true } },
    { name: "conflicting uppercase SMS", capabilities: { voice: true, SMS: false, sms: true } },
    { name: "conflicting lowercase SMS", capabilities: { voice: true, SMS: true, sms: false } },
  ])("rejects $name without any purchase mutation", async ({ capabilities }) => {
    h.inventory.mockResolvedValue([{ ...eligible, capabilities }]);
    await expect(listNativeAvailableLocalNumbers("tenant", "312")).resolves.toEqual([]);
    await expect(purchase()).rejects.toMatchObject({ status: 409 });
    await expect(purchaseNativeNumber({ userId: "tenant", areaCode: "312" })).rejects.toMatchObject(
      { status: 404 },
    );
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.owned).not.toHaveBeenCalled();
  });
});

describe("US local carrier purchase boundary", () => {
  it("verifies the exact preferred local number before its durable claim and purchase", async () => {
    await expect(purchase()).resolves.toMatchObject({ phoneNumber, sid });
    expect(h.available).toHaveBeenCalledWith("US");
    expect(h.inventory).toHaveBeenCalledWith({
      contains: `${phoneNumber}$`,
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
    });
    expect(h.inventory.mock.invocationCallOrder[0]).toBeLessThan(
      h.claim.mock.invocationCallOrder[0],
    );
    expect(h.claim.mock.invocationCallOrder[0]).toBeLessThan(h.create.mock.invocationCallOrder[0]);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber }));
  });

  it.each([
    {
      name: "toll-free selection absent from local inventory",
      preferred: "+18005550123",
      rows: [],
    },
    {
      name: "Canadian selection",
      preferred: "+14165550123",
      rows: [{ ...eligible, phoneNumber: "+14165550123", isoCountry: "CA" }],
    },
    { name: "substituted number", rows: [{ ...eligible, phoneNumber: "+13125550124" }] },
    { name: "missing country", rows: [{ ...eligible, isoCountry: undefined }] },
    { name: "voice disabled", rows: [{ ...eligible, capabilities: { voice: false, sms: true } }] },
    { name: "SMS disabled", rows: [{ ...eligible, capabilities: { voice: true, sms: false } }] },
    { name: "missing capabilities", rows: [{ ...eligible, capabilities: undefined }] },
    { name: "unavailable number", rows: [] },
  ])(
    "rejects $name without reserving capacity or buying an alternative",
    async ({ preferred, rows }) => {
      h.inventory.mockResolvedValue(rows);
      await expect(purchase(preferred)).rejects.toMatchObject({ status: 409 });
      expect(h.inventory).toHaveBeenCalledTimes(1);
      expect(h.claim).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      expect(h.owned).not.toHaveBeenCalled();
    },
  );

  it("does not purchase when inventory cannot be verified", async () => {
    h.inventory.mockRejectedValue(new Error("Inventory temporarily unavailable"));
    await expect(purchase()).rejects.toThrow("Inventory temporarily unavailable");
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("filters invalid provider rows from both the picker and automatic local selection", async () => {
    h.inventory.mockResolvedValue([
      { ...eligible, phoneNumber: "+14165550123", isoCountry: "CA" },
      { ...eligible, phoneNumber: "+13125550125", capabilities: { voice: false, sms: true } },
      { ...eligible, phoneNumber: "invalid" },
      eligible,
    ]);
    await expect(listNativeAvailableLocalNumbers("tenant", "312")).resolves.toEqual([
      { phoneNumber, locality: null, region: null },
    ]);
    await expect(
      purchaseNativeNumber({ userId: "tenant", areaCode: "312" }),
    ).resolves.toMatchObject({
      phoneNumber,
      sid,
    });
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber }));
  });

  it("does not purchase when automatic inventory has no supported local number", async () => {
    h.inventory.mockResolvedValue([{ ...eligible, isoCountry: "CA" }]);
    await expect(purchaseNativeNumber({ userId: "tenant", areaCode: "312" })).rejects.toMatchObject(
      {
        status: 404,
      },
    );
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });

  it("recovers an accepted ambiguous purchase without searching availability again", async () => {
    h.create.mockRejectedValue(Object.assign(new Error("Carrier timeout"), { status: 504 }));
    h.owned.mockResolvedValue([
      { phoneNumber, sid, friendlyName: "BotBound native inventory-test" },
    ]);
    await expect(purchase()).resolves.toMatchObject({ phoneNumber, sid });
    expect(h.inventory).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.owned).toHaveBeenCalledWith({ phoneNumber, limit: 10 });
    expect(h.retain).toHaveBeenCalledWith(expect.anything(), "provider_accepted");
  });
});
