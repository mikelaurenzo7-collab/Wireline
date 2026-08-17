import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native phone reassignment race", () => {
  it("detaches native routing before changing the assigned agent", () => {
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const detach = assignment.indexOf("await deactivateNativeXAIPhoneLine({");
    const localMutation = assignment.indexOf('"phone_number_changed"');

    expect(detach).toBeGreaterThan(-1);
    expect(localMutation).toBeGreaterThan(-1);
    expect(detach).toBeLessThan(localMutation);
    expect(assignment).toContain("if (changesAgent)");
    expect(assignment).toContain("restorePreviousRouting");
    expect(assignment).toContain("configured Twilio failover");
  });
});
