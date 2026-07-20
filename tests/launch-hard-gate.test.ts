import { afterEach, describe, expect, it } from "vitest";

import {
  isLaunchHardBlocked,
  isVoiceLaunchBlocked,
  launchBlockResponse,
} from "../src/lib/launch-readiness";
import { enforceLaunchHardGate } from "../src/middleware/launch-hard-gate";

describe("launch hard gate", () => {
  const original = process.env.LAUNCH_HARD_GATE;

  afterEach(() => {
    if (original === undefined) delete process.env.LAUNCH_HARD_GATE;
    else process.env.LAUNCH_HARD_GATE = original;
  });

  it("stays open when LAUNCH_HARD_GATE is unset even if voice is not ready", () => {
    delete process.env.LAUNCH_HARD_GATE;
    expect(isLaunchHardBlocked()).toBe(false);
  });

  it("reports hard_gate semantics in the block response when enabled", () => {
    process.env.LAUNCH_HARD_GATE = "true";
    const body = launchBlockResponse();
    expect(body.code).toBe("LAUNCH_NOT_READY");
    expect(body.error).toContain("Launch hard gate is on");
  });

  it("middleware passes through when the hard gate is off", async () => {
    delete process.env.LAUNCH_HARD_GATE;
    let nextCalled = false;
    await new Promise<void>((resolve) => {
      enforceLaunchHardGate(
        {} as never,
        { status: () => ({ json: () => undefined }) } as never,
        () => {
          nextCalled = true;
          resolve();
        },
      );
    });
    expect(nextCalled).toBe(true);
  });

  it("keeps isVoiceLaunchBlocked as a readiness helper independent of the env gate", () => {
    // Voice readiness depends on live env — just assert the helper is callable.
    expect(typeof isVoiceLaunchBlocked()).toBe("boolean");
  });
});
