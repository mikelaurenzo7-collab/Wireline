import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  reportVoiceShutdown,
  resolveVoiceHostShutdownGraceSeconds,
} from "../src/lib/voice/voice-worker-shutdown";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("voice worker shutdown evidence", () => {
  it("warns at SIGTERM and errors before the host kill when calls remain", () => {
    const log = logger();
    let fire: () => void = () => undefined;
    let delay = 0;
    let load = { active: 2, pending: 0 };
    reportVoiceShutdown({
      load: () => load,
      log,
      hostGraceSeconds: 300,
      setTimer: (fn, ms) => {
        fire = fn;
        delay = ms;
        return {};
      },
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("live calls"),
      expect.objectContaining({ active: 2, hostGraceSeconds: 300 }),
    );
    expect(delay).toBe(280_000);
    load = { active: 1, pending: 0 };
    fire();
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("lose call control"),
      expect.objectContaining({ active: 1 }),
    );
  });

  it("stays quiet when calls finish inside the grace", () => {
    const log = logger();
    let fire: () => void = () => undefined;
    reportVoiceShutdown({
      load: () => ({ active: 0, pending: 0 }),
      log,
      hostGraceSeconds: 300,
      setTimer: (fn) => {
        fire = fn;
        return {};
      },
    });
    expect(log.info).toHaveBeenCalled();
    fire();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("bounds the configured host grace", () => {
    expect(resolveVoiceHostShutdownGraceSeconds({})).toBe(300);
    expect(resolveVoiceHostShutdownGraceSeconds({ VOICE_HOST_SHUTDOWN_GRACE_SECONDS: "5" })).toBe(
      300,
    );
    expect(resolveVoiceHostShutdownGraceSeconds({ VOICE_HOST_SHUTDOWN_GRACE_SECONDS: "120" })).toBe(
      120,
    );
  });

  it("voice never auto-deploys over live calls and the worker reports its shutdown", () => {
    const blueprint = readFileSync("render.yaml", "utf8");
    const voice = blueprint.slice(blueprint.indexOf("name: botbound-voice"));
    const voiceBlock = voice.slice(0, voice.indexOf("envVars:"));
    expect(voiceBlock).toContain('autoDeployTrigger: "off"');
    expect(voiceBlock).toContain("maxShutdownDelaySeconds: 300");
    const worker = readFileSync("src/entrypoints/voice-worker.ts", "utf8");
    const stop = worker.slice(worker.indexOf("const stop = async"));
    expect(stop.indexOf("reportVoiceShutdown(")).toBeGreaterThan(stop.indexOf("beginDrain();"));
    expect(stop.indexOf("cancelShutdownReport();")).toBeGreaterThan(
      stop.indexOf("await drainBackgroundWork();"),
    );
  });
});
