#!/usr/bin/env tsx
// Local-only preview renderer for the shareable recap templates.
// Writes two HTML files to a temporary directory; never mounted in the app.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderCallRecap } from "../src/lib/shareable-artifact/template/render-call-recap.js";
import { renderWeeklyRecap } from "../src/lib/shareable-artifact/template/render-weekly-recap.js";
import type { WorkspaceBrand } from "../src/lib/shareable-artifact/brand.js";
import type { CallRecapContent, WeeklyRecapContent } from "../src/lib/shareable-artifact/types.js";

// Default to the OS temp directory so the preview never depends on one
// contributor's machine layout. Override with PREVIEW_OUT_DIR when you want the
// files somewhere you can keep them.
const OUT_DIR = process.env.PREVIEW_OUT_DIR || join(tmpdir(), "wireline-recap-preview");

const brand: WorkspaceBrand = {
  displayName: "Rita's Dental",
  accentHex: null,
  theme: "obsidian",
  logoUrl: null,
  contactLine: null,
  wirelineCreditVisible: true,
};

const call: CallRecapContent = {
  kind: "call_recap",
  version: 1,
  agent: { name: "Sarah", role: "Front Desk" },
  outcome: "booked",
  outcomeLabel: "Booked",
  hero: "Booked a cleaning for next Tuesday at 10:30 AM.",
  metadata: {
    direction: "inbound",
    durationSeconds: 214,
    startedAtIso: "2026-10-12T15:04:00Z",
    campaignSource: null,
  },
  caller: { name: "Diane K.", phone: "+1 415 555 0100" },
  moments: [
    { atSeconds: 12, note: "Caller asked whether new-patient exams need X-rays." },
    { atSeconds: 63, note: "Offered next Tuesday 10:30 AM; caller accepted." },
    { atSeconds: 128, note: "Confirmed insurance carrier and portal sign-up." },
    { atSeconds: 184, note: "Sent new-patient forms link before hanging up." },
  ],
  actions: [
    { description: "Verify the calendar confirmation went through.", owner: "Front desk" },
    { description: "Send new-patient forms email and follow up in 24 hours.", owner: "Sarah" },
    { description: "Log lead source as returning-patient referral.", owner: "Front desk", dueAtLabel: "Today" },
  ],
  transcript: [
    { role: "caller", text: "Hi, I'd like to book a cleaning appointment." },
    { role: "agent", text: "Wonderful — do you have a preferred day and time?" },
    { role: "caller", text: "Tuesday morning would be perfect if you have anything." },
    { role: "agent", text: "I have 10:30 AM next Tuesday available. Would that work?" },
    { role: "caller", text: "Yes, let's do that. Anything I need to bring?" },
    { role: "agent", text: "I'll send you the new patient forms by email — please fill them in before you arrive." },
  ],
  sentiment: "positive",
  intentLabel: "book appointment",
  summary:
    "Diane booked a routine cleaning for next Tuesday 10:30 AM. New-patient forms sent by email. Insurance carrier confirmed. Reception should verify calendar and follow up on the forms in 24 hours.",
};

const week: WeeklyRecapContent = {
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
    { hero: "Recovered a lapsed patient with a callback.", caller: "Anders Family", atLabel: "Thu" },
  ],
  followUps: [
    { description: "Return Ms. Alvarez's callback about pediatric evaluation.", priority: "high", dueAtLabel: "Today" },
    { description: "Confirm invoice reminder to Anders Family.", priority: "medium" },
    { description: "Send Oct newsletter draft to review.", priority: "low", dueAtLabel: "Fri" },
  ],
  headline: "27 booked · 12 qualified · 322 voice minutes on the wire.",
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(`${OUT_DIR}/call-recap.html`, renderCallRecap(call, brand));
writeFileSync(`${OUT_DIR}/weekly-recap.html`, renderWeeklyRecap(week, brand));
console.log("wrote previews to", OUT_DIR);
