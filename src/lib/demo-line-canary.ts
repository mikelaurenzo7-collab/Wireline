/**
 * Opt-in control-plane canary for the retired founder showcase PSTN fleet.
 *
 * BotBound's public founder demo is browser-only. This legacy probe remains
 * available for a future deliberate Twilio reprovisioning exercise, but it is
 * disabled by default and must never alert on or repair retired phone numbers
 * during normal production operations.
 */
import { inArray } from "drizzle-orm";

import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import * as schema from "../db/schema";
import { sendEmail } from "./email-service";
import { resolveFounderUserId } from "./founder-fleet-seed";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { getTwilioClient } from "./twilio-service";
import {
  configureNativeNumberRouting,
  isNativeNumberOpenAIRouted,
  type NativeNumberRoutingSnapshot,
} from "./voice/native-phone-carrier";
import { openAISipConfigured } from "./voice/openai-sip-config";
import { alertOnVoiceDegradation, computeVoiceHealthWindow } from "./voice-observability";

const FOUNDER_PSTN_CANARY_ENV = "BOTBOUND_ENABLE_FOUNDER_PSTN_CANARY";

export function founderPstnCanaryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[FOUNDER_PSTN_CANARY_ENV] === "true";
}

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
  skipped?: boolean;
  skipReason?: "founder_pstn_retired";
  voiceWindowHealthy?: boolean;
  voiceWindow?: Awaited<ReturnType<typeof computeVoiceHealthWindow>>;
  error?: string;
}

function probeLine(
  agent: ContactAgent,
  kind: "cs" | "demo",
  carrierNumbers: Map<string, NativeNumberRoutingSnapshot>,
  assignments: Set<string>,
  runtimeReady: boolean,
): LineProbeResult {
  const number = carrierNumbers.get(agent.tel);
  const numberOk = number ? isNativeNumberOpenAIRouted(number) : false;
  const assistantOk = runtimeReady && assignments.has(agent.tel);
  const errors = [
    !number ? "number missing from Twilio" : null,
    number && !numberOk ? "Twilio voice webhook is not the OpenAI inbound bridge" : null,
    !runtimeReady ? "OpenAI SIP runtime is not configured" : null,
    runtimeReady && !assignments.has(agent.tel) ? "no Bot is assigned in BotBound" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    name: agent.name,
    tel: agent.tel,
    kind,
    numberOk,
    assistantOk,
    daysSinceLastCall: null,
    ...(errors.length ? { error: errors.join("; ") } : {}),
  };
}

async function repairShowcaseOpenAIInboundRouting(
  rows: Array<
    NativeNumberRoutingSnapshot & {
      phoneNumber?: string | null;
      sid?: string | null;
    }
  >,
): Promise<boolean> {
  if (!openAISipConfigured() || rows.length === 0) return false;
  const founderUserId = await resolveFounderUserId();
  if (!founderUserId) return false;

  let attempted = false;
  for (const row of rows) {
    const phoneNumber = String(row.phoneNumber || "");
    if (!phoneNumber) continue;
    if (isNativeNumberOpenAIRouted(row)) continue;
    attempted = true;
    try {
      await configureNativeNumberRouting({
        userId: founderUserId,
        phoneNumber,
        carrierNumberId: String(row.sid || "").trim() || null,
      });
    } catch (error) {
      log.warn("Showcase OpenAI inbound routing repair failed", {
        phoneSuffix: phoneNumber.slice(-4),
        error: getErrorMessage(error),
      });
    }
  }
  return attempted;
}

export async function runDemoLineCanary(): Promise<CanaryRunResult> {
  const result: CanaryRunResult = {
    timestamp: new Date().toISOString(),
    allHealthy: true,
    lines: [],
    alertSent: false,
  };

  if (!founderPstnCanaryEnabled()) {
    result.skipped = true;
    result.skipReason = "founder_pstn_retired";
    log.info("Demo-line PSTN canary skipped because the founder PSTN showcase fleet is retired");
    return result;
  }

  const agents = [
    ...WIRELINE_CONTACT_AGENTS.map((agent) => ({ agent, kind: "cs" as const })),
    ...WIRELINE_DEMO_AGENTS.map((agent) => ({ agent, kind: "demo" as const })),
  ];
  const client = getTwilioClient();
  if (!client) {
    result.allHealthy = false;
    result.error = "Twilio is not configured";
    result.alertSent = await sendCanaryAlert(result);
    return result;
  }

  try {
    const [initialCarrierRows, assignmentRows] = await Promise.all([
      client.incomingPhoneNumbers.list({ limit: 1_000 }),
      drizzle
        .select({
          phoneNumber: schema.phoneNumbers.phoneNumber,
          agentId: schema.phoneNumbers.agentId,
        })
        .from(schema.phoneNumbers)
        .where(
          inArray(
            schema.phoneNumbers.phoneNumber,
            agents.map(({ agent }) => agent.tel),
          ),
        ),
    ]);
    const showcaseTels = new Set(agents.map(({ agent }) => agent.tel));
    const repaired = await repairShowcaseOpenAIInboundRouting(
      initialCarrierRows.filter((row) => showcaseTels.has(String(row.phoneNumber || ""))),
    );
    const carrierRows = repaired
      ? await client.incomingPhoneNumbers.list({ limit: 1_000 })
      : initialCarrierRows;
    const carrierNumbers = new Map(
      carrierRows.map((row) => [
        String(row.phoneNumber || ""),
        {
          smsUrl: row.smsUrl,
          smsMethod: row.smsMethod,
          voiceUrl: row.voiceUrl,
          voiceMethod: row.voiceMethod,
          voiceFallbackUrl: row.voiceFallbackUrl,
          voiceFallbackMethod: row.voiceFallbackMethod,
        },
      ]),
    );
    const assignments = new Set(
      assignmentRows.filter((row) => Boolean(row.agentId)).map((row) => row.phoneNumber),
    );
    const runtimeReady = openAISipConfigured();
    result.lines = agents.map(({ agent, kind }) =>
      probeLine(agent, kind, carrierNumbers, assignments, runtimeReady),
    );
    result.allHealthy = result.lines.every((line) => line.numberOk && line.assistantOk);
  } catch (error) {
    result.allHealthy = false;
    result.error = error instanceof Error ? error.message : "Showcase line probe failed";
  }

  try {
    const voiceWindow = await computeVoiceHealthWindow({ demoOnly: true, windowMinutes: 60 });
    result.voiceWindow = voiceWindow;
    result.voiceWindowHealthy = voiceWindow.healthy;
    if (!voiceWindow.healthy) {
      result.allHealthy = false;
      await alertOnVoiceDegradation({ window: voiceWindow, channel: "demo-line" });
    }
  } catch (error) {
    log.warn("Demo-line canary voice window check failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (!result.allHealthy) {
    log.error("Demo-line canary detected failures", {
      unhealthy: result.lines
        .filter((line) => !line.numberOk || !line.assistantOk)
        .map((line) => ({ name: line.name, phoneSuffix: line.tel.slice(-4), error: line.error })),
      globalError: result.error,
    });
    result.alertSent = await sendCanaryAlert(result);
  } else {
    log.info("Demo-line canary: all lines healthy", { lines: result.lines.length });
  }
  return result;
}

async function sendCanaryAlert(run: CanaryRunResult): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL?.trim();
  if (!ownerEmail) {
    log.warn("Demo-line canary cannot alert because OWNER_EMAIL is unset");
    return false;
  }
  const unhealthy = run.lines.filter((line) => !line.numberOk || !line.assistantOk);
  const details = [
    ...(run.error ? [`Global error: ${run.error}`] : []),
    ...unhealthy.map((line) => `${line.name} (${line.tel}): ${line.error || "unknown"}`),
  ];
  const sent = await sendEmail({
    to: ownerEmail,
    subject: `BotBound demo-line alert: ${unhealthy.length} degraded`,
    text: ["Demo-line canary detected issues.", "", ...details, "", `Run at: ${run.timestamp}`].join(
      "\n",
    ),
    html: `<h2>BotBound demo-line alert</h2><p>${details.map(escapeHtml).join("<br>")}</p><p>Run at ${escapeHtml(run.timestamp)}</p>`,
  });
  if (!sent.ok) log.error("Demo-line canary alert email failed", { error: sent.error });
  return sent.ok;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
