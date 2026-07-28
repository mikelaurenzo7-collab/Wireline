import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("degraded and delayed Vapi runtime behavior", () => {
  const route = read("src/routes/vapi-v2.ts");
  const workflow = read("src/routes/vapi/tool-handlers-workflow.ts");
  const idempotency = read("src/lib/agent-tool-idempotency.ts");

  it("gives the solvency fallback one durable message-taking action", () => {
    expect(route).toContain("buildDurableTakeMessageAssistant");
    expect(route).toContain('name: "create_followup_task"');
    expect(route).toContain("Promise follow-up only if the result explicitly confirms");
    expect(route).toContain("message persistence is unavailable");
    expect(route).not.toContain("make sure the team gets back to you");
    expect(route).not.toContain("promise a prompt follow-up");
  });

  it("treats timeouts as potentially active operations rather than safe retries", () => {
    expect(route).toContain("may still be processing");
    expect(route).toContain("Do not repeat it or claim success or failure");
    expect(route).not.toContain("offer to follow up by email or text");
    expect(route).not.toContain("Continue the conversation and try another approach");
  });

  it("never invents a callback time when parsing fails", () => {
    expect(workflow).toContain("if (!dueAt)");
    expect(workflow).toContain("exact date, time, and timezone");
    expect(workflow).not.toContain("Date.now() + 24 * 60 * 60 * 1000");
    expect(workflow).not.toContain("within the next day");
  });

  it("keeps transfer retries complete and async escalation truthful", () => {
    expect(idempotency).toContain('"escalate_to_human"');
    expect(idempotency).toContain("output.destination");
    expect(workflow).toContain("Human supervisors were alerted");
    expect(workflow).toContain("do not promise a response time");
    expect(workflow).not.toContain("a human will reach out shortly");
  });
});
