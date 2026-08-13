import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const absent = (path: string) => !existsSync(resolve(process.cwd(), path));

describe("guided agent setup retirement", () => {
  it("keeps the retired call-plan builder and its orphaned learning model deleted", () => {
    // PhoneAgentBlueprint was removed 2026-08-13: nothing rendered it, so its
    // gate was asserting guidance wiring on UI no user could reach. The
    // guided-agent-learning model existed only to feed that component, so it
    // left with it. The live activation surface is CreateAgentDialog plus the
    // recipe forms under src/components/recipes/, covered by
    // product-voice-contract and authenticated-agent-flow-contract.
    expect(absent("src/components/PhoneAgentBlueprint.tsx")).toBe(true);
    expect(absent("src/lib/guided-agent-learning.ts")).toBe(true);
  });
});
