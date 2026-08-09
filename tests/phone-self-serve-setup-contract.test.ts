import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("self-service calling setup", () => {
  it("makes setup the primary Calls entry and keeps operations beside it", () => {
    const phonePage = read("src/pages/PhonePage.tsx");

    expect(phonePage).toContain('{ id: "setup", label: "Setup" }');
    expect(phonePage).toContain('defaultTab: "setup"');
    expect(phonePage).toContain('primaryTab === "setup"');
    expect(phonePage).toContain("<PhoneSetupPanel />");
    expect(phonePage).toContain('{ id: "logs", label: "History" }');
    expect(phonePage).toContain('{ id: "outbound", label: "Outbound" }');
  });

  it("lets the customer choose the agent and area code before provisioning", () => {
    const setup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("agent_id: selectedAgentId");
    // The carrier route requires exactly three digits, so the panel sends the
    // normalized value and refuses a partial one client-side rather than
    // surfacing a raw field-level validation error.
    expect(setup).toContain("area_code: requestedAreaCode");
    expect(setup).toContain("Enter a full 3-digit area code");
    expect(setup).toContain('aria-label="Choose the voice agent for this number"');
    expect(setup).toContain('aria-label="Preferred phone number area code"');
    expect(setup).toContain("Activate number");
    expect(setup).toContain("Paid plan required for activation.");
    expect(setup).toContain('import { WL_APP_CLASSES } from "../lib/wireline-design-system"');
    expect(setup).toContain("<p className={WL_APP_CLASSES.wiredEyebrow}>Routing</p>");
    expect(setup).not.toContain("Set up the complete call experience before going live.");
    expect(setup).not.toContain('aria-label="Calling setup steps"');
  });

  it("turns activation blocks into a recoverable setup path and exposes a real inbound test", () => {
    const setup = read("src/components/PhoneSetupPanel.tsx");

    expect(setup).toContain("body.recovery_path");
    expect(setup).toContain('body.code === "ACTIVATION_REQUIRED"');
    expect(setup).toContain("Choose a plan and continue setup");
    expect(setup).toContain("Call this number now");
    expect(setup).toContain("href={`tel:${activeNumber.phone_number}`}");
  });
});
