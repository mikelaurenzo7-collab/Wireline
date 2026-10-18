import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const h = vi.hoisted(() => ({
  rows: [] as unknown[][],
  queries: [] as unknown[],
  fetch: vi.fn(),
  update: vi.fn(),
  calls: vi.fn(),
  canonical: null as string | null,
  receipts: {} as Record<string, unknown>,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => {
      const q: any = {
        from: () => q,
        where: (where: unknown) => {
          h.queries.push(where);
          return q;
        },
        limit: async () => h.rows.shift() ?? [],
      };
      return q;
    },
  },
}));
vi.mock("../src/lib/twilio-service", () => ({ getTwilioClient: () => ({ calls: h.calls }) }));
vi.mock("../src/lib/voice-call-identity", () => ({
  resolveVoiceFundingId: async (_db: unknown, _user: string, id: string) => h.canonical ?? id,
  readVoiceIdentityReceipt: async (_db: unknown, _user: string, key: string) => h.receipts[key],
}));
import {
  enforceFundedCarrierCallLimit,
  readTerminalCarrierDuration,
} from "../src/lib/voice/funded-carrier-call";

const sid = `CA${"1".repeat(32)}`;
const providerId = "openai:rtc-test";
const limit = () => ({ maxSeconds: 2400, deadlineAtMs: Date.now() + 10000 });
beforeEach(() => {
  h.canonical = null;
  h.receipts = {};
  h.rows = [[{ sourceId: `twilio:${sid}`, agentId: "bot" }]];
  h.queries = [];
  h.fetch.mockReset().mockResolvedValue({ sid, status: "in-progress", duration: null });
  h.update.mockReset().mockResolvedValue({ sid });
  h.calls.mockReset().mockReturnValue({ fetch: h.fetch, update: h.update });
});

describe("funded carrier limits and recovery", () => {
  it("never raises the original pre-SIP cap during acceptance, REFER or a replay", async () => {
    const canonical = "outbound:12345678-1234-4234-8234-123456789012";
    h.canonical = canonical;
    h.receipts[`voice_funding_phase:${canonical}:carrier`] = {
      metadata: { provider_call_id: `twilio:${sid}` },
    };
    h.receipts[`voice_outbound_dispatched:${canonical}`] = {
      metadata: { carrier_max_seconds: 80 },
    };
    h.rows.push([{ sourceId: `twilio:${sid}`, agentId: "bot" }]);
    await enforceFundedCarrierCallLimit("tenant", providerId, limit());
    await enforceFundedCarrierCallLimit("tenant", providerId, limit());
    expect(h.update.mock.calls).toEqual([[{ timeLimit: 80 }], [{ timeLimit: 80 }]]);
  });
  it("keeps the self-phone parent within its existing 90-second cap", async () => {
    await enforceFundedCarrierCallLimit("tenant", providerId, {
      maxSeconds: 120,
      deadlineAtMs: Date.now() + 10000,
      phoneTest: true,
    });
    expect(h.update).toHaveBeenCalledWith({ timeLimit: 90 });
  });
  it("updates the original tenant-bound parent with the same total limit on retry", async () => {
    h.rows.push([{ sourceId: `twilio:${sid}`, agentId: "bot" }]);
    await enforceFundedCarrierCallLimit("tenant", providerId, limit());
    await enforceFundedCarrierCallLimit("tenant", providerId, limit());
    expect(h.calls.mock.calls).toEqual([[sid], [sid]]);
    expect(h.update.mock.calls).toEqual([[{ timeLimit: 2400 }], [{ timeLimit: 2400 }]]);
    const query = new PgDialect().sqlToQuery(h.queries[0] as any);
    expect(query.params).toEqual(["tenant", providerId]);
  });
  it("recognizes the server-owned fallback parent source", async () => {
    h.rows = [[{ sourceId: `twilio-fallback:${sid}`, agentId: "bot" }]];
    await enforceFundedCarrierCallLimit("tenant", `twilio-fallback:${sid}`, limit());
    expect(h.calls).toHaveBeenCalledWith(sid);
  });
  it("resolves outbound through exact tenant, Bot, placement and attached OpenAI identity", async () => {
    h.rows = [
      [{ sourceId: "outbound:placement", agentId: "bot" }],
      [{ callId: sid, metadata: { native_voice: { twilio_call_sid: sid } } }],
    ];
    await enforceFundedCarrierCallLimit("tenant", providerId, limit());
    const query = new PgDialect().sqlToQuery(h.queries[1] as any);
    expect(query.params).toEqual(["tenant", "bot", "placement", providerId]);
    expect(h.calls).toHaveBeenCalledWith(sid);
  });
  it.each([
    null,
    { callId: sid, metadata: { native_voice: { twilio_call_sid: `CA${"2".repeat(32)}` } } },
  ])("does not guess an outbound carrier SID when its binding differs", async (placement) => {
    h.rows = [[{ sourceId: "outbound:placement", agentId: "bot" }], placement ? [placement] : []];
    await expect(
      enforceFundedCarrierCallLimit("tenant", providerId, limit()),
    ).rejects.toMatchObject({ status: 503 });
    expect(h.calls).not.toHaveBeenCalled();
  });
  it("cannot touch an unowned call or renew an expired deadline", async () => {
    h.rows = [[]];
    await expect(enforceFundedCarrierCallLimit("other", providerId, limit())).rejects.toMatchObject(
      { status: 503 },
    );
    await expect(
      enforceFundedCarrierCallLimit("tenant", providerId, {
        maxSeconds: 2400,
        deadlineAtMs: Date.now() - 1,
      }),
    ).rejects.toMatchObject({ code: "VOICE_FUNDING_EXPIRED" });
    expect(h.calls).not.toHaveBeenCalled();
  });
  it.each(["in-progress", "ringing", "queued"])(
    "keeps %s calls unresolved rather than inventing duration",
    async (status) => {
      h.fetch.mockResolvedValue({ sid, status, duration: "0" });
      await expect(readTerminalCarrierDuration("tenant", providerId)).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it.each([undefined, null, "", "3.4", "-1", "2147483648"])(
    "rejects malformed completed duration %s",
    async (duration) => {
      h.fetch.mockResolvedValue({ sid, status: "completed", duration });
      await expect(readTerminalCarrierDuration("tenant", providerId)).rejects.toMatchObject({
        status: 503,
      });
    },
  );
  it("retains exact terminal seconds and distinguishes confirmed no-answer", async () => {
    h.rows.push([{ sourceId: `twilio:${sid}`, agentId: "bot" }]);
    h.fetch
      .mockResolvedValueOnce({ sid, status: "completed", duration: "121" })
      .mockResolvedValueOnce({ sid, status: "no-answer", duration: "" });
    await expect(readTerminalCarrierDuration("tenant", providerId)).resolves.toEqual({
      durationSeconds: 121,
      unanswered: false,
    });
    await expect(readTerminalCarrierDuration("tenant", providerId)).resolves.toEqual({
      durationSeconds: 0,
      unanswered: true,
    });
    expect(h.update).not.toHaveBeenCalled();
  });
  it("rejects carrier identity substitution", async () => {
    h.fetch.mockResolvedValue({ sid: `CA${"2".repeat(32)}`, status: "completed", duration: "10" });
    await expect(readTerminalCarrierDuration("tenant", providerId)).rejects.toMatchObject({
      status: 503,
    });
  });
});
