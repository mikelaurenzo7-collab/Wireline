import type { Request, Response, NextFunction } from "express";
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  reservations: new Map<string, { userId: string; phoneE164: string }>(),
  gate: vi.fn(),
  place: vi.fn(),
}));
function pass(_req: Request, _res: Response, next: NextFunction) {
  next();
}
vi.mock("../src/middleware/auth", () => ({ authenticateUser: pass }));
vi.mock("../src/lib/voice-spend-control", () => ({ outboundVoiceGuard: () => pass }));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: h.gate }));
vi.mock("../src/lib/voice/outbound-call-service", () => ({ placeOutboundCall: h.place }));
vi.mock("../src/lib/voice/openai-outbound-placement", () => ({
  readNativeOutboundRequestReplay: async () => null,
  readNativeOutboundRequestStatus: vi.fn(),
  cancelMissingNativeOutboundRequest: vi.fn(),
}));
vi.mock("../src/lib/prepared-call", () => ({
  assertPreparedCallMatches: vi.fn(),
  readPreparedCall: vi.fn(),
  preparedCallStatus: vi.fn(),
}));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  inspectOutboundRecipientPermission: async () => ({
    effectiveCallPurpose: "service_or_requested",
  }),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/sentry-events", () => ({ SentryEvents: { outboundDialStarted: vi.fn() } }));
vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn() },
  drizzle: {
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({
      values: (row: { operationKey: string; userId: string; phoneE164: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (h.reservations.has(row.operationKey)) return [];
            h.reservations.set(row.operationKey, row);
            return [{ id: row.operationKey }];
          },
        }),
      }),
    }),
  },
}));

import router from "../src/routes/outbound-dial-atomic-routes";

beforeEach(() => {
  h.reservations.clear();
  vi.clearAllMocks();
  h.gate.mockResolvedValue({ allowed: false, reason: "blocked_internal_dnc" });
});

it("lets separate accounts reserve the same client UUID without blocking each other", async () => {
  const layer = router.stack.find((entry) => entry.route?.path === "/api/outbound/dial");
  const handler = layer!.route!.stack.at(-1)!.handle;
  const requestKey = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const [userId, phone] of [
    ["tenant-a", "+13125550123"],
    ["tenant-b", "+13125550124"],
  ]) {
    const req = {
      user: { id: userId },
      body: {
        agentId: "bot",
        customerNumber: phone,
        requestKey,
        callPurpose: "service_or_requested",
      },
    } as unknown as Request;
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    await handler(req, res as unknown as Response, vi.fn());
    // Both reach their own compliance decision; neither hits the other account's reservation.
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ dncBlocked: true }));
  }
  expect(h.reservations.size).toBe(2);
  expect(h.gate).toHaveBeenCalledTimes(2);
  expect(h.place).not.toHaveBeenCalled();
});
