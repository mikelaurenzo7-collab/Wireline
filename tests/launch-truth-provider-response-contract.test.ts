import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("launch-truth provider and response-time contracts", () => {
  it("discloses how AgentMail and Resend divide email processing", () => {
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const security = read("src/components/Security.tsx");

    expect(privacy).toContain("<strong>AgentMail</strong>");
    expect(privacy).toMatch(
      /AgentMail[\s\S]{0,180}Platform-managed Bot mailboxes[\s\S]{0,180}inbound and[\s\S]{0,80}outbound Bot email/,
    );
    expect(security).toContain("AgentMail for platform-managed Bot mailboxes and Bot email");
    expect(security).toContain("Resend for transactional platform email");
  });

  it("does not publish unsupported support or escalation response times", () => {
    const security = read("src/components/Security.tsx");
    const dataDeletion = read("public/legal/data-deletion.html");
    const escalation = read("src/lib/bot-tools/workflow.ts");

    expect(security).not.toMatch(/acknowledge reports within|within one business day/i);
    expect(dataDeletion).not.toMatch(/respond within two business days/i);
    expect(escalation).not.toMatch(/4 business hours|sla\s*:/i);
    expect(escalation).toContain("schema.followUpTasks");
    expect(escalation).toContain('taskType: "human_escalation"');
    expect(escalation).toContain("do not promise a response time");
  });
});
