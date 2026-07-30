import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("July 30 mobile clarity QA", () => {
  it("keeps Fast Start anchored at the top on touch layouts", () => {
    const source = read("src/components/CreateAgentDialog.tsx");
    expect(source).toContain('window.matchMedia("(pointer: fine)").matches');
    expect(source).toContain("window.innerWidth >= 768");
    expect(source).not.toContain("One sentence is enough");
  });

  it("keeps repeated and interruptive mobile copy compact", () => {
    const consent = read("src/components/CookieConsent.tsx");
    const voices = read("src/components/voice/SimpleVoicePicker.tsx");
    const review = read("src/components/StudioAgentReviewPanel.tsx");

    expect(consent).toContain(
      "Essential storage keeps Wireline working. Optional ad measurement stays off unless",
    );
    expect(consent).not.toContain("privacy-friendly product analytics help Wireline operate");
    expect(voices).not.toContain("Use for live calls");
    expect(voices).toContain("Selected");
    expect(review).toContain('/helpful assistant.*phone agent/');
    expect(review).toContain('{ label: "Job", value: role }');
    expect(review).not.toContain('label: "Customer-facing job"');
  });

  it("uses readable mobile labels instead of internal abbreviations", () => {
    const tabs = read("src/lib/page-sub-tabs.ts");
    expect(tabs).toContain('shortLabel: "Campaign"');
    expect(tabs).toContain('shortLabel: "Sequence"');
    expect(tabs).toContain('shortLabel: "Callback"');
    expect(tabs).not.toContain('shortLabel: "Camps"');
    expect(tabs).not.toContain('shortLabel: "Seq"');
    expect(tabs).not.toContain('shortLabel: "Cbks"');
  });

  it("does not present stale scheduled appointments as upcoming", () => {
    const appointments = read("src/components/AppointmentsPanel.tsx");
    expect(appointments).toContain("isPastAppointment");
    expect(appointments).toContain('appointment.status === "Scheduled" ? "Past"');
    expect(appointments).toContain("leftPast ? 1 : -1");
  });

  it("keeps Fast Start setup labels short", () => {
    const copy = read("src/lib/product-copy.ts");
    expect(copy).toContain('setupLabel: "Personal agent in 1 minute"');
    expect(copy).toContain('setupLabel: "Business agent in 1 minute"');
  });
});
