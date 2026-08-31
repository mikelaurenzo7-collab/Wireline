/**
 * Legacy founder showcase PSTN canary.
 *
 * The founder-owned showcase PSTN fleet was intentionally retired before the
 * BotBound customer launch. Customer phone service remains the native
 * OpenAI Realtime + Twilio path and is verified by the production release
 * gates; this job must not probe, repair, or alert on retired founder numbers.
 */
import type { HealthWindowResult } from "./voice-observability";
import { log } from "./server-context";

export const FOUNDER_SHOWCASE_PSTN_STATUS = "retired" as const;

export interface LineProbeResult {
  name: string;
  tel: string;
  kind: "cs" | "demo";
  numberOk: boolean;
  assistantOk: boolean;
  daysSinceLastCall: number | null;
  error?: string;
}

export interface CanaryRunResult {
  timestamp: string;
  allHealthy: boolean;
  lines: LineProbeResult[];
  alertSent: boolean;
  skipped: boolean;
  reason: typeof FOUNDER_SHOWCASE_PSTN_STATUS;
  voiceWindowHealthy?: boolean;
  voiceWindow?: HealthWindowResult;
  error?: string;
}

export async function runDemoLineCanary(): Promise<CanaryRunResult> {
  const result: CanaryRunResult = {
    timestamp: new Date().toISOString(),
    allHealthy: true,
    lines: [],
    alertSent: false,
    skipped: true,
    reason: FOUNDER_SHOWCASE_PSTN_STATUS,
  };

  log.info("Founder showcase PSTN canary skipped", {
    reason: FOUNDER_SHOWCASE_PSTN_STATUS,
    customerVoiceRuntime: "openai_realtime_twilio",
  });

  return result;
}
