import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { agentMailSuppressionReason, parseAgentMailWebhookEvent } from "../src/lib/agentmail-webhook";

const ownedMailbox = readFileSync("src/lib/owned-email-account.ts", "utf8");
const mailboxIdentity = readFileSync("src/lib/mailbox-identity.ts", "utf8");
const mailboxPersistence = readFileSync("src/lib/mailbox-inbox-persist.ts", "utf8");
const integrations = readFileSync("src/lib/integrations.ts", "utf8");
const agentmailWebhookRoutes = readFileSync("src/routes/agentmail-webhook-routes.ts", "utf8");
const google = readFileSync("src/routes/oauth/google.ts", "utf8");
const microsoft = readFileSync("src/routes/oauth/microsoft.ts", "utf8");
const yahoo = readFileSync("src/routes/oauth/yahoo.ts", "utf8");
const icloud = readFileSync("src/routes/icloud-mail-routes.ts", "utf8");
const agentmail = readFileSync("src/routes/agentmail-routes.ts", "utf8");
const dailyBrief = readFileSync("src/routes/daily-brief-routes.ts", "utf8");
const androidAsk = readFileSync(
  "android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt",
  "utf8",
);

const mailboxRoutes = [google, microsoft, yahoo, icloud, agentmail];

describe("mailbox ownership hardening", () => {
  it("uses an atomic conflict predicate and never updates mailbox ownership", () => {
    expect(ownedMailbox).toContain("setWhere: eq(emailAccounts.userId, input.userId)");
    expect(ownedMailbox).toContain("emailAddress.trim().toLowerCase()");

    const updateSet = ownedMailbox.match(/set:\s*\{([\s\S]*?)\n\s*\},\n\s*setWhere:/)?.[1] || "";
    expect(updateSet).not.toContain("userId");
  });

  it("preserves a refresh token only for a reconnect to the same provider", () => {
    expect(ownedMailbox).toContain(
      "case when ${emailAccounts.provider} = ${input.provider} then ${emailAccounts.refreshToken} else null end",
    );
  });

  it("routes every supported mailbox connection through the ownership guard", () => {
    for (const route of mailboxRoutes) {
      expect(route).toContain("upsertOwnedEmailAccount");
      expect(route).toContain("EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE");
      expect(route).not.toContain("target: schema.emailAccounts.emailAddress");
    }
  });

  it("keys AgentMail connection mutations by the authenticated tenant", () => {
    expect(agentmail).toContain("createRateLimiter");
    expect(agentmail).not.toContain("createIpRateLimiter");
    expect(agentmail).toMatch(
      /"\/api\/integrations\/agentmail\/connect",\s*authenticateUser,\s*agentmailConnectRateLimiter,\s*validateBody/,
    );
    expect(agentmail).toMatch(
      /"\/api\/integrations\/agentmail\/disconnect",\s*authenticateUser,\s*agentmailConnectRateLimiter/,
    );
  });

  it("namespaces provider ids to the verified mailbox account", () => {
    expect(mailboxIdentity).toContain('MAILBOX_SCOPED_ID_PREFIX = "mailbox:v1:"');
    expect(mailboxIdentity).toContain('createHash("sha256")');
    expect(mailboxIdentity).toContain('update(normalizedAccountId, "utf8")');
    expect(mailboxIdentity).toContain('update(externalId, "utf8")');

    expect(mailboxPersistence).toContain("accountId: string");
    expect(mailboxPersistence).toContain("mailboxScopedExternalId(accountId, rawThreadId)");
    expect(mailboxPersistence).toContain("mailboxScopedExternalId(accountId, message.messageId)");
    expect(mailboxPersistence).toContain("accountId: message.accountId");
    expect(mailboxPersistence).toContain("ownedAccountIds.has(accountId)");
    expect(mailboxPersistence).toContain(
      "Mailbox persistence rejected an account outside the tenant.",
    );
    expect(mailboxPersistence).toContain(
      "${schema.emailThreads.accountId} = excluded.account_id",
    );
  });

  it("adopts legacy history only for one unambiguous connected mailbox", () => {
    expect(mailboxPersistence).toContain("ownedAccounts.length === 1");
    expect(mailboxPersistence).toContain("requestedAccountIds.size === 1");
    expect(mailboxPersistence).toContain("isNull(schema.emailThreads.accountId)");
    expect(mailboxPersistence).toContain("legacyMessages");
    expect(mailboxPersistence).toContain("messageConflict");
    expect(mailboxPersistence).toContain("existingScopedThreadIds");
  });

  it("carries the canonical email-account id through every inbox provider", () => {
    expect(integrations).toContain("accountId: string;");
    expect(integrations).toContain('const mailAccounts = await this.getAccounts("mail");');
    const fetchSection = integrations.match(
      /async fetchInboxMessages[\s\S]*?async sendEmail/,
    )?.[0];
    expect(fetchSection).toBeTruthy();
    expect(fetchSection).not.toContain('getAccounts("calendar")');
    expect(integrations.match(/accountId: String\(account\.id\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(agentmailWebhookRoutes).toContain(
      "processVerifiedAgentMailWebhook(account.userId, account.id, req.body as Buffer)",
    );
  });

  it("never regresses the latest thread preview when an older provider retry arrives", () => {
    expect(mailboxPersistence).toContain("incomingThreadIsNotOlder");
    expect(mailboxPersistence).toContain("excluded.last_message_at >=");
    expect(mailboxPersistence).toContain(
      "then excluded.subject else ${schema.emailThreads.subject} end",
    );
    expect(mailboxPersistence).toContain(
      "then excluded.customer_email else ${schema.emailThreads.customerEmail} end",
    );
    expect(mailboxPersistence).toContain(
      "then excluded.summary else ${schema.emailThreads.summary} end",
    );
    expect(mailboxPersistence).toContain(
      "then excluded.last_message_at else ${schema.emailThreads.lastMessageAt} end",
    );
  });

  it("validates required OAuth provider response fields before persistence", () => {
    expect(google).toContain("Google token response omitted access_token.");
    expect(microsoft).toContain("Microsoft token response omitted access_token.");
    expect(microsoft).toContain("Microsoft profile request failed");
    expect(yahoo).toContain("no access_token in Yahoo response");
  });
});

describe("AgentMail delivery payload hardening", () => {
  it("reads and deduplicates all canonical bounce recipients", () => {
    const event = parseAgentMailWebhookEvent({
      event_type: "message.bounced",
      bounce: {
        message_id: "msg_bounce",
        recipients: [
          { address: "invalid@example.com", status: "bounced" },
          { address: "second@example.com", status: "bounced" },
          { address: "INVALID@example.com", status: "bounced" },
        ],
      },
    });

    expect(event.messageId).toBe("msg_bounce");
    expect(event.suppressionRecipients).toEqual([
      "invalid@example.com",
      "second@example.com",
    ]);
    expect(agentMailSuppressionReason(event.eventType)).toBe("agentmail_bounced");
  });

  it("suppresses complaints but never treats rejected sends as recipient opt-outs", () => {
    const complaint = parseAgentMailWebhookEvent({
      event_type: "message.complained",
      complaint: {
        recipients: ["complainer@example.com"],
      },
    });
    expect(complaint.suppressionRecipients).toEqual(["complainer@example.com"]);
    expect(agentMailSuppressionReason(complaint.eventType)).toBe("agentmail_complained");

    const rejected = parseAgentMailWebhookEvent({
      event_type: "message.rejected",
      reject: {
        reason: "Invalid recipient address",
      },
    });
    expect(rejected.suppressionRecipients).toEqual([]);
    expect(rejected.rejectionReason).toBe("Invalid recipient address");
    expect(agentMailSuppressionReason(rejected.eventType)).toBeNull();
  });

  it("derives safe text for HTML-only messages and requires AgentMail event_type", () => {
    const htmlOnly = parseAgentMailWebhookEvent({
      event_type: "message.received",
      message: {
        message_id: "msg_html",
        from: "lead@example.com",
        html: "<style>p { color: red; }</style><p>Hello <strong>there</strong> &amp; welcome</p>",
      },
    });
    expect(htmlOnly.snippet).toBe("Hello there & welcome");
    expect(() => parseAgentMailWebhookEvent({ type: "event", message: {} })).toThrow(
      /event type is missing/,
    );
  });
});

describe("daily brief status contracts", () => {
  it("reports Gmail readiness only for an actual Google mailbox", () => {
    expect(dailyBrief).toContain('eq(schema.emailAccounts.provider, "google")');
  });

  it("preserves intentional validation errors instead of masking them as 500s", () => {
    expect(dailyBrief).toContain("rethrowIfAppError(e)");
    expect(dailyBrief).toContain("send_at must be HH:MM (UTC).");
  });

  it("recognizes the current AI runtime offline contract", () => {
    expect(dailyBrief).toContain('err?.code === "AI_RUNTIME_OFFLINE"');
    expect(dailyBrief).toContain('code === "AI_RUNTIME_OFFLINE"');
    expect(dailyBrief).toContain('msg.includes("AI runtime required")');
  });
});

describe("Android Ask Wireline truthfulness", () => {
  it("derives plan status from loaded account data instead of inventing billing health", () => {
    expect(androidAsk).toContain("account.subscriptionStatus");
    expect(androidAsk).toContain("account.planName");
    expect(androidAsk).not.toContain("All subscription plans are active");
    expect(androidAsk).not.toContain("your billing subscription is active");
  });

  it("does not claim an outbound call succeeded before the async API result", () => {
    expect(androidAsk).toContain("Outbound call request submitted");
    expect(androidAsk).not.toContain("Outbound call placed with agent");
  });
});
