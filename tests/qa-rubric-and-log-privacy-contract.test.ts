import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  conversationShapeForLog,
  emailMaskForLog,
  phoneSuffixForLog,
} from "../src/lib/twilio-webhook-privacy";

const ROOT = resolve(process.cwd());
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8").replace(/\r\n/g, "\n");

describe("the QA rubric actually runs", () => {
  it("does not spend a sales rubric model call after a phone call", () => {
    expect(read("src/lib/post-call-digest.ts")).not.toContain('type: "auto_qa_score"');
    expect(read("src/lib/voice/openai-sip-session.ts")).not.toContain(
      "source: QA_SCORE_SOURCE_HEURISTIC",
    );
    expect(read("src/lib/job-worker-base.ts")).toContain(
      "sales rubric is not part of the call report",
    );
  });

  it("does not score a call with the sales rubric", () => {
    const worker = read("src/lib/job-worker-base.ts");
    const job = worker.slice(worker.indexOf('if (job.type === "auto_qa_score")'));
    expect(job).toContain("sales rubric is not part of the call report");
    expect(job).not.toContain("qaRubricShouldRun");
    expect(job).not.toContain("claudeBrain.qaScore");
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
    expect(read("src/routes/openai-sip-routes.ts")).not.toMatch(
      /log\.(?:info|warn|error|debug)\([\s\S]{0,400}transcript:/,
    );
    expect(read("src/lib/bot-tools/workflow.ts")).not.toMatch(
      /log\.(?:info|warn|error|debug)\([\s\S]{0,400}(?:callerPhone|customerNumber|phone):/,
    );
    expect(read("src/routes/auth-oauth-routes.ts")).toContain("emailMaskForLog(normalized)");
    for (const path of [
      "src/lib/csat-service.ts",
      "src/routes/compliance-routes.ts",
      "src/lib/bot-tools/core.ts",
    ]) {
      expect(read(path)).toContain("phoneSuffixForLog(");
    }
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
