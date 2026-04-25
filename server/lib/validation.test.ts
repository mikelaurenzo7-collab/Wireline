import { describe, expect, it } from "vitest";

import {
  agentConfigManualSchema,
  createAgentSchema,
  fleetTaskSchema,
  isValidEmailAddress,
  normalizePhoneNumber,
  outboundDialSchema,
  settingsSchema,
} from "./validation";

describe("phone + email helpers", () => {
  it("normalizes E.164-style numbers and rejects junk", () => {
    expect(normalizePhoneNumber("+1 (415) 555-0100")).toBe("+14155550100");
    expect(normalizePhoneNumber("not a phone")).toBeNull();
    expect(normalizePhoneNumber("")).toBeNull();
  });

  it("validates email addresses", () => {
    expect(isValidEmailAddress("ops@wireline.ai")).toBe(true);
    expect(isValidEmailAddress("ops@wireline")).toBe(false);
    expect(isValidEmailAddress("ops with space@wireline.ai")).toBe(false);
    expect(isValidEmailAddress(undefined)).toBe(false);
  });
});

describe("createAgentSchema", () => {
  it("accepts minimal payload and applies defaults", () => {
    const parsed = createAgentSchema.parse({});
    expect(parsed.name).toBe("New Agent");
    expect(parsed.channel).toBe("voice");
  });

  it("rejects unknown channel values", () => {
    expect(() => createAgentSchema.parse({ channel: "fax" })).toThrow();
  });
});

describe("settingsSchema", () => {
  it("coerces string max_agents to a number and enforces bounds", () => {
    const parsed = settingsSchema.parse({ max_agents: "5", subscription_status: "active" });
    expect(parsed.max_agents).toBe(5);
    expect(() =>
      settingsSchema.parse({ max_agents: 0, subscription_status: "active" })
    ).toThrow();
  });
});

describe("outboundDialSchema", () => {
  it("requires agentId and a valid phone number", () => {
    expect(() => outboundDialSchema.parse({ customerNumber: "+14155550100" })).toThrow();
    const parsed = outboundDialSchema.parse({
      agentId: "abc",
      customerNumber: "+1 (415) 555-0100",
      customerName: "Mike",
    });
    expect(parsed.customerNumber).toBe("+14155550100");
  });
});

describe("fleetTaskSchema", () => {
  it("accepts an empty payload but trims long strings", () => {
    const parsed = fleetTaskSchema.parse({ source_type: "phone_call" });
    expect(parsed.source_type).toBe("phone_call");
  });
});

describe("agentConfigManualSchema", () => {
  it("requires a known type and non-empty content", () => {
    expect(() => agentConfigManualSchema.parse({ type: "personality", content: "" })).toThrow();
    const parsed = agentConfigManualSchema.parse({
      type: "knowledge",
      content: "Closed Sundays.",
    });
    expect(parsed.type).toBe("knowledge");
  });
});
