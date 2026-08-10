/* eslint-disable @typescript-eslint/no-explicit-any -- Vapi API responses are untyped. */
/**
 * Demo-Line Canary — nightly health probe for the 8 public showcase numbers.
 *
 * What it checks per number:
 *   1. Vapi phone-number record exists and has an assistantId assigned.
 *   2. The assistantId resolves to a live Vapi assistant (GET /assistant/:id).
 *   3. (Optional) If the line had zero calls in the last 7 days AND is a "cs"
 *      line, that's a soft warning (the employee lines should see daily traffic
 *      from prospects). Demo lines may go quiet — not an alert.
 *
 * If ANY line fails checks 1 or 2, the canary fires an email to OWNER_EMAIL.
 *
 * NOT a synthetic-call canary (that costs money per probe). This verifies
 * the infrastructure is wired — if a number is disconnected, or the
 * assistant was accidentally deleted, we know before the next prospect calls.
 *
 * Triggered via the job queue as `demo_line_canary` (nightly 04:00 UTC).
 * Also exposed via GET /api/health/voice-status for on-demand use.
 */

import { log } from "./server-context";
import { sendEmail } from "./email-service";
import { alertOnVoiceDegradation, computeVoiceHealthWindow } from "./voice-observability";
import {
  WIRELINE_CONTACT_AGENTS,
  WIRELINE_DEMO_AGENTS,
  type ContactAgent,
} from "../data/contact-agents";

const VAPI_BASE = "https://api.vapi.ai";

function vapiKey(): string | null {
  return process.env.VAPI_PRIVATE_KEY || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface LineProbeResult {
  name: string;
  tel: string;
  kind: "cs" | "demo";
  /** Whether the number exists in Vapi with an assigned assistant. */
  numberOk: boolean;
  /** Whether the assistant is reachable in Vapi. */
  assistantOk: boolean;
  /** Days since last call on this number (null if lookup failed or no data). */
  daysSinceLastCall: number | null;
  /** Error details if either check failed. */
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

// ─────────────────────────────────────────────────────────────────────────────
// Vapi API helpers.
//
// A nightly canary must not page the owner on a single cold-start timeout. A
// transient failure (request timeout or network abort) is retried once; a
// definitive HTTP response — e.g. 404 for a genuinely deleted assistant — is
// returned immediately and never retried, so a real outage still alerts on the
// first run while "Assistant unreachable: operation aborted due to timeout"
// false positives are absorbed.
// ─────────────────────────────────────────────────────────────────────────────

const VAPI_FETCH_TIMEOUT_MS = 12_000;
const VAPI_FETCH_TRANSIENT_RETRIES = 1;

async function vapiFetch(path: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  const key = vapiKey();
  if (!key) return { ok: false, error: "VAPI_PRIVATE_KEY not configured" };

  const authHeader = "Bearer " + key;
  let lastError = "fetch failed";
  for (let attempt = 0; attempt <= VAPI_FETCH_TRANSIENT_RETRIES; attempt++) {
    try {
      const res = await fetch(`${VAPI_BASE}${path}`, {
        headers: {
          Authorization: authHeader,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(VAPI_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        // A returned HTTP status is a real answer, not a transient blip — do not
        // retry it, so a genuine 404/5xx still surfaces on this run.
        const body = await res.text().catch(() => "");
        return { ok: false, error: `Vapi ${res.status}: ${body.slice(0, 200)}` };
      }
      const data = await res.json();
      return { ok: true, data };
    } catch (err: any) {
      // Timeout or network abort — transient. Retry once with a short backoff so
      // one cold-start slowness does not alert about an otherwise healthy line.
      lastError = err?.message || "fetch failed";
      if (attempt < VAPI_FETCH_TRANSIENT_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  return { ok: false, error: lastError };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core probe logic
// ─────────────────────────────────────────────────────────────────────────────

async function probeLine(
  agent: ContactAgent,
  kind: "cs" | "demo",
  vapiNumbers: any[],
): Promise<LineProbeResult> {
  const result: LineProbeResult = {
    name: agent.name,
    tel: agent.tel,
    kind,
    numberOk: false,
    assistantOk: false,
    daysSinceLastCall: null,
  };

  // Step 1: Find the Vapi number record matching this tel
  const vapiNumber = vapiNumbers.find((n: any) => n.number === agent.tel);

  if (!vapiNumber) {
    result.error = `Number ${agent.tel} not found in Vapi account`;
    return result;
  }

  if (!vapiNumber.assistantId) {
    result.error = `Number ${agent.tel} has no assistantId assigned`;
    return result;
  }

  result.numberOk = true;

  // Step 2: Verify the assistant exists
  const assistantRes = await vapiFetch(`/assistant/${vapiNumber.assistantId}`);
  if (!assistantRes.ok) {
    result.error = `Assistant ${vapiNumber.assistantId} unreachable: ${assistantRes.error}`;
    return result;
  }

  result.assistantOk = true;

  // Step 3: Check recent call activity (informational, not a hard failure)
  const callsRes = await vapiFetch(`/call?phoneNumberId=${vapiNumber.id}&limit=1&sortOrder=DESC`);
  if (callsRes.ok && Array.isArray(callsRes.data) && callsRes.data.length > 0) {
    const lastCallDate = new Date(callsRes.data[0].createdAt || callsRes.data[0].startedAt);
    if (!isNaN(lastCallDate.getTime())) {
      result.daysSinceLastCall = Math.floor(
        (Date.now() - lastCallDate.getTime()) / (24 * 60 * 60 * 1000),
      );
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function runDemoLineCanary(): Promise<CanaryRunResult> {
  const result: CanaryRunResult = {
    timestamp: new Date().toISOString(),
    allHealthy: true,
    lines: [],
    alertSent: false,
  };

  // Prefetch all Vapi numbers once (cheaper than N individual lookups)
  const numbersRes = await vapiFetch("/phone-number");
  if (!numbersRes.ok) {
    result.allHealthy = false;
    result.error = `Failed to list Vapi numbers: ${numbersRes.error}`;
    // Still try to alert
    await sendCanaryAlert(result);
    return result;
  }

  const vapiNumbers: any[] = Array.isArray(numbersRes.data) ? numbersRes.data : [];

  // Probe all lines in parallel
  const probes = [
    ...WIRELINE_CONTACT_AGENTS.map((a) => probeLine(a, "cs", vapiNumbers)),
    ...WIRELINE_DEMO_AGENTS.map((a) => probeLine(a, "demo", vapiNumbers)),
  ];

  result.lines = await Promise.all(probes);

  // Determine overall health — a line is unhealthy if number or assistant check failed
  const unhealthyLines = result.lines.filter((l) => !l.numberOk || !l.assistantOk);
  result.allHealthy = unhealthyLines.length === 0;

  try {
    const voiceWindow = await computeVoiceHealthWindow({ demoOnly: true, windowMinutes: 60 });
    result.voiceWindow = voiceWindow;
    result.voiceWindowHealthy = voiceWindow.healthy;
    if (!voiceWindow.healthy) {
      result.allHealthy = false;
      await alertOnVoiceDegradation({ window: voiceWindow, channel: "demo-line" });
    }
  } catch (err: any) {
    log.warn("Demo-line canary voice window check failed", { error: err?.message });
  }

  if (!result.allHealthy) {
    log.error("Demo-line canary detected failures", {
      unhealthy: unhealthyLines.map((l) => ({ name: l.name, tel: l.tel, error: l.error })),
    });
    result.alertSent = await sendCanaryAlert(result);
  } else {
    log.info("Demo-line canary: all lines healthy", {
      lines: result.lines.length,
      csQuiet: result.lines.filter((l) => l.kind === "cs" && (l.daysSinceLastCall ?? 0) > 7).length,
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert
// ─────────────────────────────────────────────────────────────────────────────

async function sendCanaryAlert(run: CanaryRunResult): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    log.warn("Demo-line canary: OWNER_EMAIL not set, cannot send alert");
    return false;
  }

  const unhealthy = run.lines.filter((l) => !l.numberOk || !l.assistantOk);
  const subject = `🚨 Wireline Demo Line Alert — ${unhealthy.length} line${unhealthy.length !== 1 ? "s" : ""} degraded`;

  const textLines = [
    "Demo-Line Canary detected issues:",
    "",
    ...(run.error ? [`Global error: ${run.error}`, ""] : []),
    ...unhealthy.map((l) => `  ❌ ${l.name} (${l.tel}): ${l.error || "unknown"}`),
    "",
    `Healthy lines: ${run.lines.filter((l) => l.numberOk && l.assistantOk).length}/${run.lines.length}`,
    run.voiceWindow
      ? `Voice window (${run.voiceWindow.windowMinutes}m): ${run.voiceWindowHealthy ? "healthy" : "degraded"} · calls=${run.voiceWindow.totalCalls} · ttft_p95=${run.voiceWindow.ttftP95Ms ?? "—"}ms`
      : "",
    "",
    "Check: GET /api/health/voice-status for full details.",
    "",
    `Run at: ${run.timestamp}`,
  ];

  const htmlLines = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">',
    '<h2 style="color: #dc2626; margin: 0 0 16px;">🚨 Demo Line Alert</h2>',
    ...(run.error
      ? [`<p style="color: #dc2626;"><strong>Global error:</strong> ${escapeHtml(run.error)}</p>`]
      : []),
    '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">',
    '<tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Agent</th><th style="padding: 8px; text-align: left;">Number</th><th style="padding: 8px; text-align: left;">Issue</th></tr>',
    ...unhealthy.map(
      (l) =>
        `<tr><td style="padding: 8px;">${escapeHtml(l.name)}</td><td style="padding: 8px;">${escapeHtml(l.tel)}</td><td style="padding: 8px; color: #dc2626;">${escapeHtml(l.error || "unknown")}</td></tr>`,
    ),
    "</table>",
    `<p style="color: #6b7280; font-size: 13px;">Healthy: ${run.lines.filter((l) => l.numberOk && l.assistantOk).length}/${run.lines.length} &middot; Run at ${run.timestamp}</p>`,
    "</div>",
  ];

  const sendResult = await sendEmail({
    to: ownerEmail,
    subject,
    text: textLines.join("\n"),
    html: htmlLines.join("\n"),
  });

  if (!sendResult.ok) {
    log.error("Demo-line canary alert email failed", { error: sendResult.error });
  }
  return sendResult.ok;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
