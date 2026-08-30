/**
 * Nightly control-plane canary for every public showcase line.
 *
 * It verifies the Twilio number still exists, its voice webhook points at the
 * canonical OpenAI SIP bridge, the database has a Bot assignment, and the
 * OpenAI SIP runtime is configured. It intentionally does not place a paid
 * synthetic call.
 */
import { inArray } from "drizzle-orm";

import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";
import * as schema from "../db/schema";
import { sendEmail } from "./email-service";
import { drizzle, log } from "./server-context";
import { getTwilioClient } from "./twilio-service";
import { openAISipConfigured } from "./voice/openai-sip-config";
import { alertOnVoiceDegradation, computeVoiceHealthWindow } from "./voice-observability";

const OPENAI_INBOUND_PATH = "/api/twilio-webhook/openai-inbound";

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
  voiceWindowHealthy?: boolean;
  voiceWindow?: Awaited<ReturnType<typeof computeVoiceHealthWindow>>;
  error?: string;
}

function webhookPath(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    return new URL(value).pathname;
  } catch {
    return "";
  }
}

function probeLine(
  agent: ContactAgent,
  kind: "cs" | "demo",
  carrierNumbers: Map<string, { voiceUrl?: unknown }>,
  assignments: Set<string>,
  runtimeReady: boolean,
): LineProbeResult {
  const number = carrierNumbers.get(agent.tel);
  const numberOk = Boolean(number) && webhookPath(number?.voiceUrl) === OPENAI_INBOUND_PATH;
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

export async function runDemoLineCanary(): Promise<CanaryRunResult> {
  const result: CanaryRunResult = {
    timestamp: new Date().toISOString(),
    allHealthy: true,
    lines: [],
    alertSent: false,
  };
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
    const [carrierRows, assignmentRows] = await Promise.all([
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
    const carrierNumbers = new Map(
      carrierRows.map((row) => [String(row.phoneNumber || ""), { voiceUrl: row.voiceUrl }]),
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
        .map((line) => ({ name: line.name, tel: line.tel, error: line.error })),
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
