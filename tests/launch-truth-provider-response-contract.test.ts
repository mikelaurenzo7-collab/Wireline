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
      /AgentMail[\s\S]{0,180}Bot mailboxes managed by the platform[\s\S]{0,180}inbound\s+and[\s\S]{0,80}outbound Bot email/,
    );
    expect(security).toContain("AgentMail for Bot mailboxes managed by the platform and Bot email");
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

  it("describes Computer task storage and the providers processing browser and error data", () => {
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const security = read("src/components/Security.tsx");

    expect(privacy).toContain("<strong>Computer task data</strong>");
    expect(privacy).toContain("task instructions, activity, questions,");
    expect(privacy).toContain("application memory rather than stored in task history");
    expect(privacy).toContain("screen context may be sent to");
    expect(privacy.replace(/\s+/g, " ")).toContain("including login information");
    expect(privacy).toContain("<strong>Browserless</strong>");
    expect(privacy).toContain("<strong>Sentry</strong>");
    expect(security).toContain("Computer: Browserless hosts remote browser sessions.");
    expect(security).toContain("Monitoring: Sentry receives redacted server error reports");
    expect(privacy).not.toMatch(/zero vendor retention|all credentials are redacted/i);
  });

  it("does not equate the database region with every provider's processing location", () => {
    const security = read("src/components/Security.tsx");
    const team = read("src/components/admin/TeamPanel.tsx");

    expect(security).toContain("Processing locations vary by provider and feature.");
    expect(security).toContain("Confirm any specific data residency requirement");
    expect(security).not.toContain("US-East");
    expect(team).toContain("By provider");
    expect(team).not.toContain("US-East");
  });

  it("requires actual audit and release evidence instead of stale scheduled milestones", () => {
    const narrative = read("docs/soc2-policies.md");

    expect(narrative).toContain("Render for the web/API and persistent voice runtime");
    expect(narrative).toContain("GitHub Actions is intentionally disabled");
    expect(narrative).toContain("signed engagement");
    expect(narrative).not.toContain("2026-06-01");
    expect(narrative).not.toContain("Q1 2027");
    expect(narrative).not.toContain("Supabase advisors currently show");
  });

  it("keeps security and privacy metadata current with the revised disclosures", () => {
    const privacy = read("src/components/PrivacyPolicyPage.tsx");
    const security = read("src/components/Security.tsx");
    const consent = read("src/lib/legal-consent.ts");

    expect(privacy).toContain("const LAST_UPDATED = ACCOUNT_PRIVACY_LAST_UPDATED");
    expect(privacy).toContain("description={ACCOUNT_PRIVACY_DESCRIPTION}");
    expect(consent).toContain("Last updated ${ACCOUNT_PRIVACY_LAST_UPDATED}.");
    expect(consent).toContain('ACCOUNT_PRIVACY_LAST_UPDATED = "October 25, 2026"');
    expect(security).toContain("Last updated · October 25, 2026");
    expect(privacy).not.toContain("Last updated September 25, 2026");
    expect(security).not.toContain("Last updated · August 17, 2026");
  });
});
