import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("AgentMail inbox error honesty contract", () => {
  const agentMail = read("src/lib/agentmail-mail.ts");
  const syncRoute = read("src/routes/email-sync-routes.ts");

  it("propagates IMAP failures instead of presenting an unreachable mailbox as empty", () => {
    expect(agentMail).toMatch(
      /log\.warn\("AgentMail inbox fetch failed", \{ email, error: getErrorMessage\(err\) \}\);\s+throw err;/,
    );
    expect(agentMail).not.toMatch(
      /log\.warn\("AgentMail inbox fetch failed", \{ email, error: getErrorMessage\(err\) \}\);\s+return \[\];/,
    );
  });

  it("requires a canonical mailbox rather than accepting a calendar-only connection", () => {
    expect(syncRoute).toContain("schema.emailAccounts");
    expect(syncRoute).not.toContain("schema.calendarAccounts");
    expect(syncRoute).toContain("if (mailAccounts.length === 0)");
    expect(syncRoute).toContain('code: "EMAIL_ACCOUNT_NOT_CONNECTED"');
  });
});
