import { describe, expect, it } from "vitest";

import type { WorkspaceBrand } from "../src/lib/shareable-artifact/brand";
import { renderCallRecap } from "../src/lib/shareable-artifact/template/render-call-recap";
import { renderNotFound } from "../src/lib/shareable-artifact/template/render-not-found";
import { renderWeeklyRecap } from "../src/lib/shareable-artifact/template/render-weekly-recap";
import type { CallRecapContent, WeeklyRecapContent } from "../src/lib/shareable-artifact/types";

const BRAND: WorkspaceBrand = {
  displayName: "Rita's Dental",
  accentHex: null,
  theme: "obsidian",
  logoUrl: null,
  contactLine: null,
  wirelineCreditVisible: true,
};

const CALL_CONTENT: CallRecapContent = {
  kind: "call_recap",
  version: 1,
  agent: { name: "Sarah", role: "Front Desk" },
  outcome: "booked",
  outcomeLabel: "Booked",
  hero: "Booked cleaning for next Tuesday at 10:30 AM.",
  metadata: {
    direction: "inbound",
    durationSeconds: 214,
    startedAtIso: "2026-10-12T15:04:00Z",
    campaignSource: null,
  },
  caller: { name: "Diane K.", phone: "+14155550100" },
  moments: [
    { atSeconds: 12, note: "Caller asked whether new-patient exams need X-rays." },
    { atSeconds: 63, note: "Offered next Tuesday 10:30 AM; caller accepted." },
    { atSeconds: 128, note: "Confirmed insurance carrier and portal-sign-up instructions." },
  ],
  actions: [
    { description: "Verify calendar confirmation went through.", owner: "Front desk" },
    { description: "Send new-patient forms email.", owner: "Sarah" },
  ],
  transcript: [
    { role: "caller", text: "Hi, I'd like to book a cleaning." },
    { role: "agent", text: "Absolutely — do you have a preferred day and time?" },
  ],
  sentiment: "positive",
  intentLabel: "book appointment",
  summary: "Caller booked a routine cleaning; new patient forms sent.",
};

const WEEKLY_CONTENT: WeeklyRecapContent = {
  kind: "weekly_recap",
  version: 1,
  period: { startIso: "2026-10-06", endIso: "2026-10-12", label: "Oct 6 – Oct 12" },
  totals: { calls: 84, voiceMinutes: 322, booked: 27, qualified: 12, followup: 9 },
  volumeByDay: [
    { label: "Mon", count: 14 },
    { label: "Tue", count: 18 },
    { label: "Wed", count: 12 },
    { label: "Thu", count: 15 },
    { label: "Fri", count: 11 },
    { label: "Sat", count: 8 },
    { label: "Sun", count: 6 },
  ],
  outcomeMix: [
    { tag: "booked", count: 27 },
    { tag: "qualified", count: 12 },
    { tag: "followup", count: 9 },
    { tag: "info", count: 20 },
    { tag: "unreachable", count: 16 },
  ],
  averageQaScore: 87,
  topMoments: [
    { hero: "Booked cleaning for next Tuesday.", caller: "Diane K.", atLabel: "Mon" },
    { hero: "Qualified referral from a longtime patient.", caller: "Marcus P.", atLabel: "Wed" },
  ],
  followUps: [
    { description: "Return Ms. Alvarez's callback about pediatric evaluation.", priority: "high" },
    { description: "Confirm invoice reminder to Anders Family.", priority: "medium" },
  ],
  headline: "27 booked · 12 qualified · 322 voice minutes.",
};

const CUSTOMER_SURFACE_VENDOR_FORBIDDEN = [
  "Vapi",
  "OpenAI",
  "xAI",
  "Grok",
  "HeyGen",
  "LiveAvatar",
  "ElevenLabs",
];

describe("shareable-artifact templates", () => {
  it("renders the Wireline shell contract on the call recap", () => {
    const html = renderCallRecap(CALL_CONTENT, BRAND);
    expect(html).toContain('meta name="robots"');
    expect(html).toContain("noindex");
    expect(html).toContain("--wl-canvas");
    expect(html).toContain("--wl-accent");
    expect(html).toContain("prefers-color-scheme: light");
    expect(html).toContain(':root[data-theme="light"]');
    expect(html).toContain("Wire → Work → Win");
    expect(html).toContain("Rita&#39;s Dental");
    expect(html).toContain("Booked");
    expect(html).toContain("Sarah");
  });

  it("renders totals + sparkline + outcome mix on the weekly recap", () => {
    const html = renderWeeklyRecap(WEEKLY_CONTENT, BRAND);
    expect(html).toContain("Weekly review");
    expect(html).toContain("Oct 6 – Oct 12");
    expect(html).toContain("Voice minutes");
    expect(html).toContain("<svg");
    expect(html).toContain("Outcome mix");
    expect(html).toContain("Booked cleaning");
  });

  it("renders a branded not-found for expired links", () => {
    const html = renderNotFound(BRAND);
    expect(html).toContain("expired");
    expect(html).toContain("Rita&#39;s Dental");
    expect(html).toContain("Wire → Work → Win");
  });

  it("customer surface never leaks vendor names", () => {
    for (const html of [
      renderCallRecap(CALL_CONTENT, BRAND),
      renderWeeklyRecap(WEEKLY_CONTENT, BRAND),
      renderNotFound(BRAND),
    ]) {
      for (const forbidden of CUSTOMER_SURFACE_VENDOR_FORBIDDEN) {
        expect(html).not.toContain(forbidden);
      }
    }
  });

  it("escapes tenant-supplied strings so a workspace name cannot inject HTML", () => {
    const html = renderCallRecap(CALL_CONTENT, {
      ...BRAND,
      displayName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
