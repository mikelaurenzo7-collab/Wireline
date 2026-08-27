import { describe, expect, it } from "vitest";

import {
  issueXAIOutboundToken,
  verifyXAIOutboundToken,
  xaiOutboundPlacementMatches,
} from "../src/lib/voice/xai-outbound-token";

const ENV = { INTERNAL_JWT_SECRET: "x".repeat(48) } as NodeJS.ProcessEnv;
const PLACEMENT_A = "550e8400-e29b-41d4-a716-446655440000";
const PLACEMENT_B = "c56a4180-65aa-42ec-a945-5fd21dec0538";

describe("xAI outbound attempt-bound tokens", () => {
  it("signs both the durable lead and one exact carrier placement", () => {
    const issued = issueXAIOutboundToken({
      leadId: "9223372036854775807",
      placementId: PLACEMENT_A,
      nowMs: 1_800_000_000_000,
      env: ENV,
    });
    const verified = verifyXAIOutboundToken(issued.token, {
      nowMs: 1_800_000_001_000,
      env: ENV,
    });

    expect(issued.token.length).toBeLessThanOrEqual(180);
    expect(verified).toEqual({
      ok: true,
      claims: expect.objectContaining({
        v: 2,
        leadId: "9223372036854775807",
        placementTag: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/),
      }),
    });
  });

  it("rejects malformed placement ids at minting", () => {
    expect(() =>
      issueXAIOutboundToken({ leadId: "1", placementId: "attempt-a", env: ENV }),
    ).toThrow(/valid placement id/i);
  });

  it("cannot authorize a later attempt on the same lead", () => {
    const { token } = issueXAIOutboundToken({
      leadId: "42",
      placementId: PLACEMENT_A,
      env: ENV,
    });
    const verification = verifyXAIOutboundToken(token, { env: ENV });
    expect(verification.ok).toBe(true);
    if (!verification.ok) return;

    expect(xaiOutboundPlacementMatches({ placement_id: PLACEMENT_A }, verification.claims)).toBe(
      true,
    );
    expect(xaiOutboundPlacementMatches({ placement_id: PLACEMENT_B }, verification.claims)).toBe(
      false,
    );
    expect(xaiOutboundPlacementMatches({}, verification.claims)).toBe(false);
  });
});
