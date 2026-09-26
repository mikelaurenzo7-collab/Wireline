import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  evaluateLaunchReadiness,
  isLaunchHardBlocked,
  isVoiceLaunchHardBlocked,
  voiceLaunchBlockResponse,
} from "../src/lib/launch-readiness";
import { selfServeBillingEnabled } from "../src/lib/billing-release";
import {
  enforceLaunchHardGate,
  enforceSelfServeBillingRelease,
  enforceVoiceLaunchHardGate,
} from "../src/middleware/launch-hard-gate";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function invoke(middleware: (req: Request, res: Response, next: () => void) => void) {
  const next = vi.fn();
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  middleware({} as Request, { status } as unknown as Response, next);
  return { next, json, status };
}

function readyVoiceEnv() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("WIRELINE_VOICE_WORKER", "");
  vi.stubEnv("WIRELINE_VOICE_WORKER_URL", "");
  vi.stubEnv("OPENAI_API_KEY", "sk-test-preview-voice");
  vi.stubEnv("OPENAI_PROJECT_ID", "proj_test_preview_voice");
  vi.stubEnv("OPENAI_WEBHOOK_SECRET", "whsec_test_preview_voice");
  vi.stubEnv("TWILIO_ACCOUNT_SID", "ACtestpreviewvoice");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-test-token");
}

function closedSelfServeBilling() {
  vi.stubEnv("WIRELINE_SELF_SERVE_BILLING_ENABLED", "false");
  vi.stubEnv("WIRELINE_LAUNCH_DEMO_MODE", "true");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/soft-open");
}

afterEach(() => vi.unstubAllEnvs());

describe("Studio Preview Voice during a closed self-serve checkout", () => {
  it("admits live session when LAUNCH_HARD_GATE is on, billing is closed, and voice deps are ready", () => {
    vi.stubEnv("LAUNCH_HARD_GATE", "true");
    closedSelfServeBilling();
    readyVoiceEnv();

    const report = evaluateLaunchReadiness();
    const billing = report.capabilities.find((capability) => capability.id === "billing_ready");
    const voice = report.capabilities.find((capability) => capability.id === "voice_ready");

    expect(selfServeBillingEnabled()).toBe(false);
    expect(billing?.blockers).toEqual(
      expect.arrayContaining(["WIRELINE_SELF_SERVE_BILLING_ENABLED=true"]),
    );
    expect(voice?.level).toBe("ready");
    expect(isLaunchHardBlocked()).toBe(true);
    expect(isVoiceLaunchHardBlocked()).toBe(false);

    const live = invoke(enforceVoiceLaunchHardGate);
    expect(live.next).toHaveBeenCalledOnce();
    expect(live.status).not.toHaveBeenCalled();

    const launch = invoke(enforceLaunchHardGate);
    expect(launch.next).not.toHaveBeenCalled();
    expect(launch.status).toHaveBeenCalledWith(503);

    const checkout = invoke(enforceSelfServeBillingRelease);
    expect(checkout.next).not.toHaveBeenCalled();
    expect(checkout.status).toHaveBeenCalledWith(503);
    expect(checkout.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "BILLING_LAUNCH_NOT_APPROVED" }),
    );
  });

  it("still hard-gates Preview Voice when voice deps are missing", () => {
    vi.stubEnv("LAUNCH_HARD_GATE", "true");
    closedSelfServeBilling();
    readyVoiceEnv();
    vi.stubEnv("OPENAI_API_KEY", "");

    expect(isVoiceLaunchHardBlocked()).toBe(true);
    const live = invoke(enforceVoiceLaunchHardGate);
    expect(live.next).not.toHaveBeenCalled();
    expect(live.status).toHaveBeenCalledWith(503);
    expect(live.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "VOICE_LAUNCH_NOT_READY",
        launch_blockers: expect.arrayContaining(["OPENAI_API_KEY"]),
      }),
    );
    expect(voiceLaunchBlockResponse().error).toContain("Preview Voice");
    expect(JSON.stringify(voiceLaunchBlockResponse())).not.toContain(
      "WIRELINE_SELF_SERVE_BILLING_ENABLED=true",
    );
  });

  it("keeps checkout and live-session fences on different gates", () => {
    const liveVoice = read("src/routes/live-voice-routes.ts");
    const sessionStart = liveVoice.indexOf('"/api/voice/live/session"');
    const sessionHandler = liveVoice.indexOf("async (req: AuthenticatedRequest", sessionStart);
    const session = liveVoice.slice(sessionStart, sessionHandler);
    expect(session).toContain("enforceVoiceLaunchHardGate");
    expect(session).not.toMatch(/\benforceLaunchHardGate\b/);
    expect(session).not.toContain("enforceSelfServeBillingRelease");

    const registry = read("src/server/register-api-routes.ts");
    expect(registry).toContain(
      'app.post("/api/billing/checkout", enforceSelfServeBillingRelease);',
    );
    const billing = read("src/routes/billing-routes.ts");
    expect(billing).toContain("enforceLaunchHardGate");
    const checkout = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    expect(checkout).toContain("enforceLaunchHardGate");
  });

  it("hides live-number checkout CTAs while self-serve billing is closed", () => {
    const setup = read("src/components/PhoneSetupPanel.tsx");
    const wizard = read("src/components/onboarding/PostCreateActivationWizard.tsx");
    const roleplay = read("src/components/RoleplaySandbox.tsx");
    const note = read("src/components/onboarding/SoftOpenCheckoutNote.tsx");
    const copy = read("src/lib/wireline-onboarding-copy.ts");

    expect(copy).toContain('title: "Live numbers, with BotBound"');
    expect(copy).toContain('cta: "Talk with BotBound"');
    expect(note).toContain("SOFT_OPEN_CHECKOUT_COPY");
    expect(setup).toContain("SoftOpenCheckoutNote");
    expect(setup).toContain("checkoutAvailable === true");
    expect(wizard).toContain("SoftOpenCheckoutNote");
    expect(wizard).toContain("canProvisionNumber");
    expect(roleplay).toContain("SOFT_OPEN_CHECKOUT_COPY");
    expect(roleplay).toContain("fetchSelfServeCheckoutAvailable");
  });
});
