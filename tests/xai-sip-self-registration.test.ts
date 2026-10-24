import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registration = vi.hoisted(() => ({
  credentials: vi.fn(),
  register: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/voice/xai-sip-config", () => ({
  xaiSipConfigured: () => true,
  buildXAISipUri: (number: string) => `sip:${number}@sip.voice.x.ai`,
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({
  OPENAI_INBOUND_SIP_TOKEN_HEADER: "x-in",
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER: "x-out",
  buildOpenAIInboundSipUri: () => "sip:openai-inbound",
  buildOpenAIOutboundSipUri: () => "sip:openai-outbound",
}));
vi.mock("../src/lib/voice/xai-phone-registration", () => ({
  xaiSipCredentialsFor: registration.credentials,
  registerXAIPhoneNumber: registration.register,
}));

import {
  resetRealtimeSipSelfRegistrationForTests,
  resolveInboundSipTarget,
} from "../src/lib/voice/realtime-sip-target";

const NUMBER = "+15125550142";

describe("xAI default phone routing without manual registration", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetRealtimeSipSelfRegistrationForTests();
    registration.credentials.mockReset();
    registration.register.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("answers on OpenAI once and registers the line in the background", async () => {
    registration.credentials.mockResolvedValue(null);
    registration.register.mockResolvedValue({ phoneNumber: NUMBER, status: "registered" });

    const target = await resolveInboundSipTarget({ calledNumber: NUMBER, token: "tok" });
    expect(target.provider).toBe("openai");
    expect(registration.register).toHaveBeenCalledWith(NUMBER);

    // A burst of calls before registration lands never stacks attempts.
    await resolveInboundSipTarget({ calledNumber: NUMBER, token: "tok" });
    expect(registration.register).toHaveBeenCalledTimes(1);
  });

  it("routes to xAI by default once the line has credentials", async () => {
    registration.credentials.mockResolvedValue({ username: "u", password: "p" });
    const target = await resolveInboundSipTarget({ calledNumber: NUMBER, token: "tok" });
    expect(target).toMatchObject({ provider: "xai", uri: `sip:${NUMBER}@sip.voice.x.ai` });
    expect(registration.register).not.toHaveBeenCalled();
  });

  it("never fails the call when background registration throws", async () => {
    registration.credentials.mockResolvedValue(null);
    registration.register.mockRejectedValue(new Error("boom"));
    const target = await resolveInboundSipTarget({ calledNumber: NUMBER, token: "tok" });
    expect(target.provider).toBe("openai");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("honors the operator opt-out without registering anything", async () => {
    vi.stubEnv("WIRELINE_PHONE_VOICE_PROVIDER", "openai");
    const target = await resolveInboundSipTarget({ calledNumber: NUMBER, token: "tok" });
    expect(target.provider).toBe("openai");
    expect(registration.credentials).not.toHaveBeenCalled();
    expect(registration.register).not.toHaveBeenCalled();
  });
});
