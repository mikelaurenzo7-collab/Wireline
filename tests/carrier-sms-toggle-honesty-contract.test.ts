import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("carrier SMS toggle honesty", () => {
  it("does not show messaging/alerts ON without a sendable config", () => {
    const source = read("src/components/admin/CarrierPanel.tsx");
    expect(source).toContain("hasSmsSendConfig");
    expect(source).toContain("hasManagerAlertConfig");
    expect(source).toContain("messagingEnabled");
    expect(source).toContain("managerAlertsEnabled");
    expect(source).toContain("checked={messagingEnabled}");
    expect(source).toContain("checked={managerAlertsEnabled}");
    // Must not blindly reflect the raw flag alone.
    expect(source).not.toContain("checked={Boolean(settings.twilio_messaging_enabled)}");
    expect(source).not.toContain("checked={Boolean(settings.twilio_manager_alerts_enabled)}");
  });
});
