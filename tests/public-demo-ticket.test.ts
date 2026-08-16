import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  issuePublicDemoTicket,
  publicDemoTicketingReady,
  PUBLIC_DEMO_TICKET_TTL_SECONDS,
  verifyPublicDemoTicket,
} from "../src/lib/public-demo-ticket";

const SECRET = "wireline-public-demo-test-secret-at-least-thirty-two-characters";

describe("protected public demo tickets", () => {
  beforeEach(() => {
    vi.stubEnv("WIRELINE_PUBLIC_DEMO_SIGNING_SECRET", SECRET);
    vi.stubEnv("INTERNAL_JWT_SECRET", "");
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("issues a short-lived ticket bound to the request IP, host, and agent", () => {
    const nowMs = Date.UTC(2026, 7, 16, 6, 0, 0);
    const { token, claims } = issuePublicDemoTicket({
      ip: "203.0.113.9",
      host: "trywireline.com",
      agentName: "Liam",
      nowMs,
    });

    expect(claims.exp - claims.iat).toBe(PUBLIC_DEMO_TICKET_TTL_SECONDS);
    expect(claims.agent).toBe("Liam");
    expect(token.split(".")).toHaveLength(2);
    expect(
      verifyPublicDemoTicket({
        token,
        ip: "203.0.113.9",
        host: "trywireline.com",
        nowMs: nowMs + 30_000,
      }),
    ).toMatchObject({ ok: true, claims: { agent: "Liam" } });
  });

  it("rejects replay context changes, expiry, and signature tampering", () => {
    const nowMs = Date.UTC(2026, 7, 16, 6, 0, 0);
    const { token } = issuePublicDemoTicket({
      ip: "203.0.113.9",
      host: "trywireline.com",
      agentName: "Liam",
      nowMs,
    });

    expect(
      verifyPublicDemoTicket({
        token,
        ip: "203.0.113.10",
        host: "trywireline.com",
        nowMs,
      }),
    ).toEqual({ ok: false, reason: "context_mismatch" });
    expect(
      verifyPublicDemoTicket({
        token,
        ip: "203.0.113.9",
        host: "evil.example",
        nowMs,
      }),
    ).toEqual({ ok: false, reason: "context_mismatch" });
    expect(
      verifyPublicDemoTicket({
        token,
        ip: "203.0.113.9",
        host: "trywireline.com",
        nowMs: nowMs + (PUBLIC_DEMO_TICKET_TTL_SECONDS + 1) * 1000,
      }),
    ).toEqual({ ok: false, reason: "expired" });

    const [payload, signature] = token.split(".");
    expect(
      verifyPublicDemoTicket({
        token: `${payload}.${signature.slice(0, -1)}x`,
        ip: "203.0.113.9",
        host: "trywireline.com",
        nowMs,
      }),
    ).toEqual({ ok: false, reason: "invalid_signature" });
  });

  it("fails closed when no sufficiently strong server signing secret exists", () => {
    vi.stubEnv("WIRELINE_PUBLIC_DEMO_SIGNING_SECRET", "");
    vi.stubEnv("INTERNAL_JWT_SECRET", "too-short");
    vi.stubEnv("VAPI_WEBHOOK_SECRET", "");

    expect(publicDemoTicketingReady()).toBe(false);
    expect(() =>
      issuePublicDemoTicket({
        ip: "203.0.113.9",
        host: "trywireline.com",
        agentName: "Liam",
      }),
    ).toThrow("Public demo ticket signing is not configured");
    expect(
      verifyPublicDemoTicket({
        token: "payload.signature",
        ip: "203.0.113.9",
        host: "trywireline.com",
      }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});
