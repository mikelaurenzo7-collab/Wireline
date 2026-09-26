import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("self-service calling setup", () => {
  it("makes call history the primary Calls entry and keeps line setup secondary", () => {
    const phonePage = read("src/pages/PhonePage.tsx");

    expect(phonePage).toContain('{ id: "logs", label: "History" }');
    expect(phonePage).toContain('defaultTab: "logs"');
    expect(phonePage).toContain('primaryTab === "logs"');
    expect(phonePage).toContain("<PhoneCallHistoryPanel");
    expect(phonePage).toContain('{ id: "outbound", label: "Outbound" }');
    expect(phonePage).toContain('{ id: "setup", label: "Lines" }');
    expect(phonePage).toContain('primaryTab === "setup"');
    expect(phonePage).toContain("<PhoneSetupPanel initialAgentId={activeAgentId} />");
    expect(phonePage).toContain(
      'aria-label={primaryTab === "setup" ? "Choose Bot for Lines" : "Filter call history by Bot"}',
    );
  });

  it("keeps self-service provisioning while presenting it as compact line management", () => {
    const setup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("agent_id: selectedAgentId");
    expect(setup).toContain("area_code: requestedAreaCode");
    expect(setup).toContain("Enter a 3-digit area code");
    expect(setup).toContain('aria-label="Bot for this line"');
    expect(setup).toContain('aria-label="Selected line"');
    expect(setup).toContain("Add line");
    expect(setup).toContain("Activate");
    expect(setup).toContain("Assigned Bot");
    expect(setup).not.toContain("Set up the complete call experience before going live.");
    expect(setup).not.toContain("Every paid plan includes a dedicated number.");
    expect(setup).not.toContain("wl-number-hero");
  });

  it("keeps activation failures recoverable and exposes a real inbound test", () => {
    const setup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("body.recovery_path");
    expect(setup).toContain('body.code === "ACTIVATION_REQUIRED"');
    expect(setup).toContain('body.code === "SUBSCRIPTION_REQUIRED"');
    expect(setup).toContain("Open billing");
    expect(setup).toContain("SoftOpenCheckoutNote");
    expect(setup).toContain("fetchSelfServeCheckoutAvailable");
    expect(setup).toContain("href={`tel:${activeNumber.phone_number}`}");
    expect(setup).toMatch(/Caller Identity/i);
    expect(setup).toContain("<details");
  });
});
