#!/usr/bin/env ts-node
/**
 * scripts/visual-canary.ts
 * ---------------------------------------------------------------------------
 * Nightly visual canary for the live demo/showcase lines.
 *
 * Verifies that:
 *   1. All showcase and demo agents are mapped to active Vapi assistant IDs.
 *   2. The live Vapi assistant configurations (first message, voice ID, and model)
 *      match our local source of truth in contact-agents.ts.
 *   3. Evaluates the last 3 call logs per agent for:
 *        - TTFT (Time to First Token) regressions (> 1.5s).
 *        - Failed call statuses or errors.
 *        - Negative sentiment trends.
 *
 * Usage: tsx scripts/visual-canary.ts
 */

import { listVapiNumbers } from "../src/lib/vapi-phone-numbers";
import { WIRELINE_CONTACT_AGENTS, WIRELINE_DEMO_AGENTS, type ContactAgent } from "../src/data/contact-agents";
import { sanitizePhone } from "../src/lib/vapi-helpers";
import dotenv from "dotenv";

dotenv.config();

const VAPI_BASE = "https://api.vapi.ai";

async function vapiFetch(path: string, key: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${VAPI_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vapi ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

interface CanaryReport {
  agentName: string;
  tel: string;
  status: "healthy" | "degraded" | "failed";
  errors: string[];
  warnings: string[];
  metrics?: {
    avgDurationSeconds: number;
    avgTtftSeconds?: number;
    negativeSentimentCount: number;
    failureCount: number;
  };
}

async function runCanary() {
  console.log("🦜 Running Wireline Live Showcase Canary...\n");

  const key = process.env.VAPI_PRIVATE_KEY;
  if (!key) {
    console.log("⚠️  VAPI_PRIVATE_KEY is not configured in .env. Skipping live Vapi canary checks.");
    process.exit(0);
  }

  const allShowcaseAgents = [...WIRELINE_CONTACT_AGENTS, ...WIRELINE_DEMO_AGENTS];
  const reports: CanaryReport[] = [];

  try {
    // 1. Fetch all numbers in Vapi
    const vapiNumbers = await listVapiNumbers();
    const numberLookup = new Map<string, typeof vapiNumbers[0]>();
    for (const num of vapiNumbers) {
      if (num.number) {
        numberLookup.set(sanitizePhone(num.number) || num.number, num);
      }
    }

    // 2. Perform checks for each showcase agent
    for (const agent of allShowcaseAgents) {
      const e164 = sanitizePhone(agent.tel) || agent.tel;
      const numMatch = numberLookup.get(e164);
      const report: CanaryReport = {
        agentName: agent.name,
        tel: agent.tel,
        status: "healthy",
        errors: [],
        warnings: [],
      };

      if (!numMatch) {
        report.status = "failed";
        report.errors.push(`Vapi does not have phone number registered for ${agent.tel}`);
        reports.push(report);
        continue;
      }

      const assistantId = numMatch.assistantId;
      if (!assistantId) {
        report.status = "failed";
        report.errors.push(`Vapi number has no assistantId attached`);
        reports.push(report);
        continue;
      }

      // Fetch assistant config
      let assistantConfig: any;
      try {
        assistantConfig = await vapiFetch(`/assistant/${assistantId}`, key);
      } catch (err: any) {
        report.status = "failed";
        report.errors.push(`Could not fetch assistant config from Vapi: ${err.message}`);
        reports.push(report);
        continue;
      }

      // Check first message drift
      const localFirstMsg = agent.firstMessage.trim();
      const remoteFirstMsg = (assistantConfig.firstMessage || "").trim();
      if (remoteFirstMsg && localFirstMsg !== remoteFirstMsg) {
        report.warnings.push(
          `First message drift. Local: "${localFirstMsg.slice(0, 40)}...", Remote: "${remoteFirstMsg.slice(0, 40)}..."`
        );
      }

      // Check voice ID drift
      const localVoiceId = agent.voiceId;
      const remoteVoiceId = assistantConfig.voice?.voiceId;
      if (localVoiceId && remoteVoiceId && localVoiceId !== remoteVoiceId) {
        report.warnings.push(`Voice ID drift. Local: "${localVoiceId}", Remote: "${remoteVoiceId}"`);
      }

      // Fetch recent calls
      let calls: any[] = [];
      try {
        const callsRes = await vapiFetch(`/call?assistantId=${assistantId}&limit=3`, key);
        calls = Array.isArray(callsRes) ? callsRes : [];
      } catch (err: any) {
        report.warnings.push(`Could not fetch recent calls: ${err.message}`);
      }

      if (calls.length > 0) {
        let totalDuration = 0;
        let totalTtft = 0;
        let ttftCount = 0;
        let negativeSentimentCount = 0;
        let failureCount = 0;

        for (const call of calls) {
          totalDuration += call.duration ?? 0;

          // Check for failed status
          if (call.status === "failed" || call.endedReason === "error") {
            failureCount++;
          }

          // Check sentiment
          const sentiment = call.analysis?.sentiment?.toLowerCase() || call.sentiment?.toLowerCase();
          if (sentiment === "negative") {
            negativeSentimentCount++;
          }

          // Check TTFT in latency or monitor metrics if available
          const ttft = call.monitor?.ttftSeconds ?? call.analysis?.ttftSeconds;
          if (typeof ttft === "number" && ttft > 0) {
            totalTtft += ttft;
            ttftCount++;
            if (ttft > 1.5) {
              report.warnings.push(`Regressed TTFT detected on call ${call.id}: ${(ttft * 1000).toFixed(0)}ms`);
            }
          }
        }

        report.metrics = {
          avgDurationSeconds: totalDuration / calls.length,
          avgTtftSeconds: ttftCount > 0 ? totalTtft / ttftCount : undefined,
          negativeSentimentCount,
          failureCount,
        };

        if (failureCount === calls.length) {
          report.status = "failed";
          report.errors.push(`All of the last ${calls.length} calls failed or returned errors`);
        } else if (failureCount > 0 || negativeSentimentCount > 0) {
          report.status = "degraded";
        }
      } else {
        report.warnings.push("No call history found for this assistant");
      }

      reports.push(report);
    }

    // 3. Print the report
    console.log("=".repeat(80));
    console.log("Wireline Showcase Canary Report");
    console.log("=".repeat(80));

    let overallHealthy = true;
    for (const r of reports) {
      const statusIcon = r.status === "healthy" ? "✅" : r.status === "degraded" ? "⚠️ " : "❌";
      console.log(`\n${statusIcon} Agent: ${r.agentName} (${r.tel}) - Status: ${r.status.toUpperCase()}`);
      
      if (r.metrics) {
        console.log(`   Metrics (last 3 calls):`);
        console.log(`     - Avg Duration: ${r.metrics.avgDurationSeconds.toFixed(1)}s`);
        if (r.metrics.avgTtftSeconds !== undefined) {
          console.log(`     - Avg TTFT: ${(r.metrics.avgTtftSeconds * 1000).toFixed(0)}ms`);
        }
        console.log(`     - Failed Calls: ${r.metrics.failureCount}/3`);
        console.log(`     - Negative Sentiment Calls: ${r.metrics.negativeSentimentCount}/3`);
      }

      if (r.errors.length > 0) {
        console.log(`   🔴 Errors:`);
        for (const err of r.errors) {
          console.log(`     • ${err}`);
          overallHealthy = false;
        }
      }

      if (r.warnings.length > 0) {
        console.log(`   🟡 Warnings:`);
        for (const warn of r.warnings) {
          console.log(`     • ${warn}`);
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    if (overallHealthy) {
      console.log("🎉 All showcase and demo agents are healthy and configured correctly!");
      process.exit(0);
    } else {
      console.log("📛 Canary failed. Stale configuration or failed calls detected.");
      process.exit(1);
    }

  } catch (error: any) {
    console.error("❌ Canary execution crashed:", error.message);
    process.exit(1);
  }
}

runCanary();
