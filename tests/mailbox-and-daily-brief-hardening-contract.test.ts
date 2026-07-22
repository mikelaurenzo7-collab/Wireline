import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ownedMailbox = readFileSync("src/lib/owned-email-account.ts", "utf8");
const google = readFileSync("src/routes/oauth/google.ts", "utf8");
const microsoft = readFileSync("src/routes/oauth/microsoft.ts", "utf8");
const yahoo = readFileSync("src/routes/oauth/yahoo.ts", "utf8");
const icloud = readFileSync("src/routes/icloud-mail-routes.ts", "utf8");
const dailyBrief = readFileSync("src/routes/daily-brief-routes.ts", "utf8");
const androidAsk = readFileSync(
  "android/app/src/main/java/com/wireline/app/ui/ask/AskWirelineScreen.kt",
  "utf8",
);

const mailboxRoutes = [google, microsoft, yahoo, icloud];

describe("mailbox ownership hardening", () => {
  it("uses an atomic conflict predicate and never updates mailbox ownership", () => {
    expect(ownedMailbox).toContain("setWhere: eq(emailAccounts.userId, input.userId)");
    expect(ownedMailbox).toContain("emailAddress.trim().toLowerCase()");

    const updateSet = ownedMailbox.match(/set:\s*\{([\s\S]*?)\n\s*\},\n\s*setWhere:/)?.[1] || "";
    expect(updateSet).not.toContain("userId");
  });

  it("preserves a provider refresh token when reconnect omits a replacement", () => {
    expect(ownedMailbox).toContain(
      "...(input.refreshToken ? { refreshToken: input.refreshToken } : {})",
    );
  });

  it("routes every supported mailbox connection through the ownership guard", () => {
    for (const route of mailboxRoutes) {
      expect(route).toContain("upsertOwnedEmailAccount");
      expect(route).toContain("EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE");
      expect(route).not.toContain("target: schema.emailAccounts.emailAddress");
    }
  });

  it("validates required OAuth provider response fields before persistence", () => {
    expect(google).toContain("Google token response omitted access_token.");
    expect(microsoft).toContain("Microsoft token response omitted access_token.");
    expect(microsoft).toContain("Microsoft profile request failed");
    expect(yahoo).toContain("no access_token in Yahoo response");
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
