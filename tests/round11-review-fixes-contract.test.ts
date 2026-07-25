import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { inputRateForModel } from "../src/lib/audit-summary";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("round-11 review fixes", () => {
  it("keeps temporal gate denials from retiring campaign leads", () => {
    const dialer = read("src/services/campaign-dialer.ts");
    // Quiet-hours and own-24h-window denials leave the lead processable; only
    // genuinely terminal denials (DNC/TCPA/duplicate-of-another-lead) may
    // write the gate status onto the lead.
    expect(dialer).toContain('gate.reason === "outside_permitted_calling_hours"');
    expect(dialer).toContain('gate.reason === "self_recent_call_scheduled"');
    expect(dialer).toContain("lead stays processable");
    const deferBranch = dialer.indexOf('gate.reason === "outside_permitted_calling_hours"');
    const statusWrite = dialer.indexOf("status: gate.status");
    expect(deferBranch).toBeGreaterThanOrEqual(0);
    expect(statusWrite).toBeGreaterThan(deferBranch);
  });

  it("feeds campaign analytics the cost_usd key it actually reads", () => {
    const routes = read("src/routes/campaign-routes.ts");
    expect(routes).toContain("cost_usd: c.costUsd");
    expect(routes).not.toMatch(/computeCallStats\([\s\S]{0,300}?\)\s*as any/);
    expect(routes).not.toContain("cost: c.costUsd");
  });

  it("matches every stored phone variant when terminating live calls on DNC adds", () => {
    const sentinel = read("src/services/sentinel.ts");
    expect(sentinel).toContain("dncPhoneCandidates(phoneNumber)");
    expect(sentinel).toContain("inArray(schema.signalPresence.customerNumber, candidates)");
    expect(sentinel).not.toContain("eq(schema.signalPresence.customerNumber");
  });

  it("bounds the daily-brief win/loss samples to yesterday on both ends", () => {
    const brief = read("src/lib/daily-brief.ts");
    const upperBounds = brief.split("lt(schema.callLogs.createdAt, yEnd)").length - 1;
    expect(upperBounds).toBeGreaterThanOrEqual(2);
  });

  it("prices gateway-prefixed and unknown models against the Grok-first table", () => {
    // Gateway-served ids ("xai/grok-4.5") must normalize to the bare model.
    expect(inputRateForModel("xai/grok-4.5")).toBe(2);
    expect(inputRateForModel("grok-4.1-fast-reasoning")).toBe(0.2);
    expect(inputRateForModel("openai/gpt-5.6-terra")).toBe(2.5);
    const audit = read("src/lib/ai-audit.ts");
    expect(audit).toContain("MODEL_PRICING[XAI_MODELS.GROK_4_5]");
    const structured = read("src/lib/ai-structured.ts");
    expect(structured).toContain('provider: "xai" | "openai" | "gemini"');
  });
});
