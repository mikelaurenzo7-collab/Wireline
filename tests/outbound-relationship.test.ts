import { describe, expect, it } from "vitest";

import {
  deriveRelationship,
  isWithinRelationshipWindow,
  phoneTail10,
} from "../src/lib/outbound-relationship";
import { OUTBOUND_RELATIONSHIP_WINDOW_MS } from "../src/lib/outbound-call-purpose";

const now = new Date("2026-10-26T12:00:00.000Z");

describe("outbound relationship", () => {
  it("reads a 10-digit tail and ignores a short number", () => {
    expect(phoneTail10("+1 (415) 555-0142")).toBe("4155550142");
    expect(phoneTail10("555")).toBeNull();
  });

  it("treats an inbound call or text inside 90 days as returning and 91 days as none", async () => {
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const call = await deriveRelationship("tenant-a", "+14155550142", {
      now: () => now,
      loadInboundCall: async (userId, tail) => {
        expect(userId).toBe("tenant-a");
        expect(tail).toBe("4155550142");
        return { id: "call-1", at: recent };
      },
      loadInboundSms: async () => null,
    });
    expect(call).toMatchObject({ kind: "returning_contact", source: "call", sourceId: "call-1" });

    const sms = await deriveRelationship("tenant-a", "+14155550142", {
      now: () => now,
      loadInboundCall: async () => ({ id: "call-old", at: new Date(recent.getTime() - 1000) }),
      loadInboundSms: async () => ({ id: "sms-1", at: recent }),
    });
    expect(sms?.source).toBe("sms");

    expect(isWithinRelationshipWindow(new Date(now.getTime() - OUTBOUND_RELATIONSHIP_WINDOW_MS), now.getTime())).toBe(
      true,
    );
    expect(
      isWithinRelationshipWindow(
        new Date(now.getTime() - OUTBOUND_RELATIONSHIP_WINDOW_MS - 24 * 60 * 60 * 1000),
        now.getTime(),
      ),
    ).toBe(false);
  });

  it("passes only the requesting tenant into the loaders", async () => {
    const seen: string[] = [];
    await deriveRelationship("tenant-b", "+14155550142", {
      now: () => now,
      loadInboundCall: async (userId) => {
        seen.push(userId);
        return null;
      },
      loadInboundSms: async (userId) => {
        seen.push(userId);
        return null;
      },
    });
    expect(seen).toEqual(["tenant-b", "tenant-b"]);
  });
});
