import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * The behavior is proven against real foreign keys in
 * tests/bot-deletion-database.test.ts, which needs a local database. These
 * checks run everywhere and pin the ordering that keeps deletion safe.
 */
describe("Bot deletion", () => {
  const service = read("src/lib/bot-deletion.ts");
  const routes = read("src/routes/agent-routes-v2.ts");

  it("requires the owner, the mutation rate limit, and a typed confirmation", () => {
    const start = routes.indexOf('router.delete(\n  "/api/agents/:id",');
    expect(start).toBeGreaterThan(-1);
    const handler = routes.slice(start, routes.indexOf("\n);", start));
    expect(handler).toContain("authenticateUser,\n  agentMutationRateLimit,");
    expect(handler).toContain('req.body?.confirmation !== "DELETE"');
    expect(handler).toContain("deleteBot({ userId: req.user.id, agentId: req.params.id");
    expect(routes).toContain('"/api/agents/:id/deletion",\n  authenticateUser,');
  });

  it("releases the number and mailbox before removing anything locally", () => {
    const release = service.indexOf("providers.releaseNumber(");
    const erase = service.indexOf("providers.eraseManagedMailboxes(");
    const transaction = service.indexOf("await db.transaction(");
    expect(release).toBeGreaterThan(-1);
    expect(erase).toBeGreaterThan(release);
    expect(transaction).toBeGreaterThan(erase);
    // A failed release stops deletion instead of orphaning a billed number.
    expect(service).toContain('"NUMBER_RELEASE_FAILED"');
    expect(service).toContain('"MAILBOX_RELEASE_FAILED"');
  });

  it("rechecks under the creation and identity locks, then deletes the Bot last", () => {
    const transaction = service.slice(service.indexOf("await db.transaction("));
    const accountLock = transaction.indexOf("pg_advisory_xact_lock(hashtext(${userId}))");
    const identityLock = transaction.indexOf("acquireCompanyIdentityMutationLock(tx, userId)");
    const recheck = transaction.indexOf("findBotDeletionBlock(tx, userId, agentId)");
    const deleteBot = transaction.indexOf(".delete(schema.agents)");
    expect(accountLock).toBeGreaterThan(-1);
    expect(identityLock).toBeGreaterThan(accountLock);
    expect(recheck).toBeGreaterThan(identityLock);
    expect(deleteBot).toBeGreaterThan(recheck);
    expect(transaction).toContain('"BOT_IDENTITY_CHANGED"');
  });

  it("waits for calls, outbound dialing, and computer tasks", () => {
    expect(service).toContain("j.type = 'post_call_digest'");
    expect(service).toContain("schema.signalPresence.startedAt");
    expect(service).toContain('["running", "needs_input"]');
    expect(service).toContain("'^CA[0-9a-fA-F]{32}$'");
  });

  it("uses the production release paths and records an audit entry", () => {
    expect(service).toContain("releaseNativeTenantNumber(userId, phoneNumber)");
    expect(service).toContain("eraseManagedAgentMailInboxesForPurge(mailboxes)");
    expect(service).toContain("apiKey: AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL");
    expect(service).toContain('operation: "bot_deletion"');
    expect(service).toContain('auditLogger.logAgentOperation("deleted"');
  });

  it("tells the owner what is released before they confirm", () => {
    const section = read("src/components/studio/DeleteBotSection.tsx");
    expect(section).toContain("/deletion`");
    expect(section).toContain("one new number every 31 days");
    expect(section).toContain("and the email in it are");
    expect(section).toContain("Call history, texts, appointments, and leads stay in your account.");
    expect(read("src/components/StudioAgentWorkspacePanel.tsx")).toContain("<DeleteBotSection");
  });
});
