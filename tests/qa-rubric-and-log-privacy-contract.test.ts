import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  QA_SCORE_SOURCE_HEURISTIC,
  QA_SCORE_SOURCE_RUBRIC,
  qaBreakdownIsRubric,
  qaRubricShouldRun,
} from "../src/lib/qa-score-provenance";
import {
  conversationShapeForLog,
  emailMaskForLog,
  phoneSuffixForLog,
} from "../src/lib/twilio-webhook-privacy";

const ROOT = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

describe("the QA rubric actually runs", () => {
  it("treats the heuristic breakdown as provisional", () => {
    // What the Vapi end-of-call handler writes on every single call.
    const heuristic = {
      source: QA_SCORE_SOURCE_HEURISTIC,
      base: 60,
      sentiment_delta: 20,
      intent_delta: 0,
      miss_delta: 0,
      rationale: "Routine call.",
      scored_at: "2026-08-15T00:00:00.000Z",
    };
    expect(qaBreakdownIsRubric(heuristic)).toBe(false);
    expect(qaRubricShouldRun(heuristic)).toBe(true);
  });

  it("treats a completed rubric as final", () => {
    const rubric = {
      source: QA_SCORE_SOURCE_RUBRIC,
      greeting: 18,
      discovery: 15,
      solution: 16,
      objection: 12,
      closing: 14,
      coaching_note: "Ask one discovery question before presenting.",
    };
    expect(qaBreakdownIsRubric(rubric)).toBe(true);
    expect(qaRubricShouldRun(rubric)).toBe(false);
  });

  it("upgrades legacy rows written before the stamp existed, with no backfill", () => {
    // Every pre-existing row is a heuristic row and carries no `source`. It
    // must still be eligible, or the rubric stays dead for the whole history.
    const legacyHeuristic = {
      base: 60,
      sentiment_delta: -20,
      intent_delta: 0,
      miss_delta: -10,
      rationale: "Caller hung up.",
      scored_at: "2026-01-01T00:00:00.000Z",
    };
    expect(qaRubricShouldRun(legacyHeuristic)).toBe(true);
    // An unstamped row that nonetheless has all five dimensions is a rubric
    // result from before the stamp, and must not be re-scored.
    expect(
      qaRubricShouldRun({ greeting: 1, discovery: 2, solution: 3, objection: 4, closing: 5 }),
    ).toBe(false);
  });

  it("treats a null or absent breakdown as never scored", () => {
    expect(qaRubricShouldRun(null)).toBe(true);
    expect(qaRubricShouldRun(undefined)).toBe(true);
    expect(qaRubricShouldRun("not an object")).toBe(true);
  });

  it("stamps both writers so the guard can tell them apart", () => {
    expect(read("src/lib/vapi-handlers.ts")).toContain("source: QA_SCORE_SOURCE_HEURISTIC");
    expect(read("src/lib/job-worker-base.ts")).toContain("source: QA_SCORE_SOURCE_RUBRIC");
  });

  it("selects the breakdown the guard reads", () => {
    // Guarding on a column the query never selected would silently re-score
    // every call, once per retry, at one Claude call each.
    const worker = read("src/lib/job-worker-base.ts");
    const job = worker.slice(worker.indexOf('if (job.type === "auto_qa_score")'));
    expect(job.slice(0, job.indexOf("qaRubricShouldRun"))).toContain(
      "qaBreakdown: schema.callLogs.qaBreakdown",
    );
  });
});

describe("customer conversation content and identifiers stay out of logs", () => {
  it("masks a phone to its last four", () => {
    expect(phoneSuffixForLog("+14155550123")).toBe("***0123");
    expect(phoneSuffixForLog("")).toBeNull();
  });

  it("masks an address without losing the domain", () => {
    expect(emailMaskForLog("Person@Example.com")).toBe("p***@example.com");
    expect(emailMaskForLog("not-an-address")).toBe("***");
    expect(emailMaskForLog("")).toBeNull();
  });

  it("describes a transcript without reproducing it", () => {
    expect(conversationShapeForLog("I need to speak to a human right now")).toEqual({
      present: true,
      length: 36,
    });
    expect(conversationShapeForLog(null)).toEqual({ present: false, length: 0 });
  });

  /**
   * Logs sit outside both boundaries meant to bound customer data:
   * `wireline_purge_old_data` walks database tables and `account-deletion.ts`
   * enumerates database tables. Neither reaches a log line, so anything written
   * here survives the retention minimum and an erasure request alike.
   */
  const FORBIDDEN = [
    { pattern: /\btranscript:\s*transcriptText\b/, what: "verbatim transcript" },
    { pattern: /\bsummary:\s*summary\.slice\(/, what: "call summary content" },
    { pattern: /\bcustomerNumber:\s*(e164|dialNumber)\b/, what: "raw customer number" },
    { pattern: /\bphone:\s*(row\.phone|rawPhone|normalizedPhone)\b/, what: "raw phone" },
    { pattern: /\bcallerPhone:\s*callerPhone\.slice\(0,\s*8\)/, what: "phone prefix" },
    { pattern: /\bemail:\s*normalized\b/, what: "raw email" },
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
    }
    return out;
  }

  it("has no log call reproducing customer content or identifiers", () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, "src"))) {
      const source = readFileSync(file, "utf8");
      // Only inspect the object literal of a log call, not unrelated code that
      // happens to build a provider request body with the same key names.
      for (const match of source.matchAll(
        /log\.(?:info|warn|error|debug)\(([\s\S]{0,400}?)\}\);/g,
      )) {
        for (const rule of FORBIDDEN) {
          if (rule.pattern.test(match[1])) {
            offenders.push(`${relative(ROOT, file)} — ${rule.what}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("routes the sites that were fixed through the masking helpers", () => {
    expect(read("src/routes/vapi-v2.ts")).toContain(
      "transcript: conversationShapeForLog(transcriptText)",
    );
    expect(read("src/routes/escalation-routes.ts")).toContain(
      "callerPhone: phoneSuffixForLog(callerPhone)",
    );
    expect(read("src/routes/auth-oauth-routes.ts")).toContain("emailMaskForLog(normalized)");
    for (const path of [
      "src/lib/csat-service.ts",
      "src/lib/vapi-client.ts",
      "src/routes/compliance-routes.ts",
      "src/routes/vapi/tool-handlers-core.ts",
    ]) {
      expect(read(path)).toContain("phoneSuffixForLog(");
    }
  });

  it("still broadcasts the transcript to the account holder's own session", () => {
    // The SSE stream is the product surface — a tenant watching their own live
    // call. Redaction belongs in the log sink, not in the feature.
    const route = read("src/routes/vapi-v2.ts");
    const broadcast = route.slice(
      route.indexOf('sseBroadcaster.broadcast(\n          "handoff_requested"'),
    );
    expect(broadcast.slice(0, 400)).toContain("transcript: transcriptText");
  });
});

describe("the platform SLO snapshot reports measurements, not constants", () => {
  const source = read("src/lib/operator-slos.ts");
  const snapshot = source.slice(source.indexOf("export async function getPlatformSloSnapshot"));

  it("computes AI reliability instead of returning zeros", () => {
    // The external monitor reads this. Hardcoded zeros meant no volume of model
    // errors across the whole fleet could ever move the ai_errors dimension.
    expect(source).toContain("async function getPlatformAiReliability");
    expect(snapshot).toContain("auditErrorsWindow: ai.errorSeverity");
    expect(snapshot).toContain("claude_calls_in_window: ai.calls");
    expect(snapshot).toContain("critical_events_in_window: ai.critical");
    expect(snapshot).not.toContain("auditErrorsWindow: 0");
  });

  it("reports real webhook retry backlog and windowed dead jobs", () => {
    expect(snapshot).toContain("pending_retry_now: pendingRetryNow");
    expect(snapshot).toContain("deadEnrichmentWindow: jobWindow.enrichment.dead");
    expect(snapshot).toContain("enrichment: jobWindow.enrichment");
    expect(snapshot).not.toContain("pending_retry_now: 0");
    expect(snapshot).not.toContain("oldest_pending_age_seconds: null");
  });
});
