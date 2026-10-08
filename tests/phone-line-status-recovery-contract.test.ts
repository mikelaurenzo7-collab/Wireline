import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("phone line status recovery", () => {
  const panel = read("src/components/PhoneSetupPanel.tsx");

  it("shows the server's reason and offers only the recovery that can help", () => {
    const routes = read("src/routes/native-phone-routing-routes.ts");
    expect(routes).toContain("native_voice_error: nativeVoiceError,");
    expect(panel).toContain("{activeNumber.native_voice_error}");
    expect(panel).toMatch(
      /native_voice_status === "configuration_required" \? \([\s\S]*?<Link to="\/support">Contact Support<\/Link>/,
    );
    expect(panel).toContain('activeNumber.native_voice_status === "unavailable" ? null : (');
  });

  it("shows a reserved line whose routing is pending instead of inviting a second purchase", () => {
    const pending = panel.slice(panel.indexOf("if (body.activation_pending && body.phone_number)"));
    expect(pending.indexOf("await loadNumbers(selectedAgentId);")).toBeGreaterThan(-1);
    expect(pending.indexOf("await loadNumbers(selectedAgentId);")).toBeLessThan(
      pending.indexOf("setError("),
    );
    expect(pending).toContain("setAddingLine(false);");
  });
});
