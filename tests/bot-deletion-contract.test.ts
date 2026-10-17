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
  const deleteBot = service.slice(service.indexOf("export async function deleteBot("));
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

  it("holds the Bot, releases its number and mailbox, then removes it", () => {
    const lock = deleteBot.indexOf('lockBotAdmission(tx, agentId, "exclusive")');
    const check = deleteBot.indexOf("findBotDeletionBlock(tx, userId, agentId)");
    const hold = deleteBot.indexOf("placeBotDeletionHold(tx, userId, agentId)");
    const release = deleteBot.indexOf("releaseBotIdentity(db, userId, agentId, providers)");
    const removal = deleteBot.indexOf("await db.transaction(", release);
    expect(lock).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(lock);
    expect(hold).toBeGreaterThan(check);
    expect(release).toBeGreaterThan(hold);
    expect(removal).toBeGreaterThan(release);
    // Any failure after the hold lets the Bot place calls again.
    expect(deleteBot).toContain("await clearBotDeletionHold(db, userId, holdId)");
    expect(deleteBot).toContain('"BOT_DELETION_IN_PROGRESS"');

    const number = service.indexOf("providers.releaseNumber(");
    const mailbox = service.indexOf("providers.eraseManagedMailboxes(");
    expect(number).toBeGreaterThan(-1);
    expect(mailbox).toBeGreaterThan(number);
    // A failed release stops deletion instead of orphaning a billed number.
    expect(service).toContain('"NUMBER_RELEASE_FAILED"');
    expect(service).toContain('"MAILBOX_RELEASE_FAILED"');
  });

  it("rechecks under the creation and identity locks, then deletes the Bot last", () => {
    const transaction = deleteBot.slice(
      deleteBot.indexOf("await db.transaction(", deleteBot.indexOf("releaseBotIdentity(")),
    );
    const accountLock = transaction.indexOf("pg_advisory_xact_lock(hashtext(${userId}))");
    const identityLock = transaction.indexOf("acquireCompanyIdentityMutationLock(tx, userId)");
    const recheck = transaction.indexOf("findBotWorkBlock(tx, userId, agentId)");
    const changed = transaction.indexOf(
      "identityChangedSinceRelease(tx, userId, agentId, mailboxes)",
    );
    const clearHold = transaction.indexOf("clearBotDeletionHold(tx, userId, holdId)");
    const deleteRow = transaction.indexOf(".delete(schema.agents)");
    expect(accountLock).toBeGreaterThan(-1);
    expect(identityLock).toBeGreaterThan(accountLock);
    expect(recheck).toBeGreaterThan(identityLock);
    expect(changed).toBeGreaterThan(recheck);
    expect(clearHold).toBeGreaterThan(changed);
    expect(deleteRow).toBeGreaterThan(clearHold);
    expect(transaction).toContain('"BOT_IDENTITY_CHANGED"');
  });

  it("stops call placement and identity setup while a deletion holds the Bot", () => {
    const placement = read("src/lib/voice/openai-outbound-placement.ts");
    const claim = placement.slice(
      placement.indexOf("export async function claimNativeOutboundPlacement("),
      placement.indexOf("export async function markNativeOutboundPlacementAccepted("),
    );
    // The new-lead and existing-lead claims both check under the shared lock.
    expect(claim.split('lockBotAdmission(tx, input.agentId, "shared")')).toHaveLength(3);
    expect(claim.split("botDeletionHoldExists(tx, input.userId, input.agentId)")).toHaveLength(3);
    expect(claim).not.toContain("await drizzle\n      .insert(schema.outboundLeads)");

    // Setup marks itself for as long as it runs, so deletion waits for it.
    const identity = read("src/lib/paid-bot-identity.ts");
    const ensure = identity.slice(
      identity.indexOf("export async function ensurePaidBotIdentity("),
      identity.indexOf("async function reconcilePaidBotIdentity("),
    );
    const begin = ensure.indexOf("await beginBotIdentitySetup(input.userId, input.agentId)");
    expect(begin).toBeGreaterThan(-1);
    expect(begin).toBeLessThan(ensure.indexOf("return await reconcilePaidBotIdentity(input);"));
    expect(ensure).toMatch(/finally \{\n\s+await endBotIdentitySetup\(input\.userId, marker\);/);
    expect(service).toContain(
      'if (await botIdentitySetupActive(db, userId, agentId)) return "identity_setup";',
    );
  });

  it("refuses new inbound calls while a deletion holds the Bot", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    const claim = session.slice(session.indexOf('if (direction === "inbound") {'));
    const lock = claim.indexOf('await lockBotAdmission(tx, input.agentId, "shared");');
    const held = claim.indexOf("botDeletionHoldExists(tx, input.userId, input.agentId)");
    expect(lock).toBeGreaterThan(-1);
    expect(held).toBeGreaterThan(lock);
    expect(held).toBeLessThan(claim.indexOf(".insert(schema.callLogs)"));
    expect(claim).toContain('"BOT_BEING_DELETED"');

    const fallback = read("src/lib/voice/twilio-fallback-store.ts");
    const fallbackLock = fallback.indexOf('await lockBotAdmission(tx, input.agentId, "shared");');
    expect(fallbackLock).toBeGreaterThan(-1);
    expect(fallbackLock).toBeLessThan(fallback.indexOf(".insert(schema.callLogs)"));
    expect(fallback).toContain(
      "if (await botDeletionHoldExists(tx, input.userId, input.agentId)) return null;",
    );

    // The webhook answers a refused claim cleanly instead of with a 500.
    const routes = read("src/routes/openai-sip-routes.ts");
    expect(routes).toContain('"BOT_BEING_DELETED",');
    expect(routes).toContain('"bot_being_deleted"');
  });

  it("waits for calls, outbound dialing, computer tasks, and identity setup", () => {
    expect(service).toContain("j.type = 'post_call_digest'");
    expect(service).toContain("schema.signalPresence.startedAt");
    expect(service).toContain('["running", "needs_input"]');
    expect(service).toContain("'^CA[0-9a-fA-F]{32}$'");
    // A claim waiting on the carrier counts, and an old pointer ages out.
    expect(service).toContain("'placement_claimed_at'");
    expect(service).toContain("nativeOutboundPlacementLeaseMs()");
    expect(service).toContain('eq(schema.jobs.status, "running")');
  });

  it("cancels queued work that only affects the Bot, and lesson jobs skip a deleted Bot", () => {
    expect(service).toContain(
      'const BOT_ONLY_JOB_TYPES = [PAID_BOT_IDENTITY_JOB_TYPE, "adaptive_optimization"];',
    );
    const worker = read("src/lib/job-worker-base.ts");
    const tuning = worker.slice(worker.indexOf('if (job.type === "adaptive_optimization")'));
    expect(tuning.indexOf("botStillExists(userId, p.agentId)")).toBeLessThan(
      tuning.indexOf("claudeBrain.synthesizeLesson("),
    );
    // The payload has no userId; the job row names the account.
    expect(tuning).toContain(
      'const userId = String(p.userId || owner.userId || owner.user_id || "");',
    );
    const enrichment = worker.slice(worker.indexOf('if (job.type === "post_call_enrichment")'));
    expect(enrichment).toContain("lessonsHaveBot && result.lesson?.trim()");
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
    expect(section).toContain("workspace chat, and computer task history are deleted.");
    expect(section).toContain("one new number every 31 days");
    expect(section).toContain("and the email in it are");
    expect(section).toContain("Call history, texts, appointments, and leads stay in your account.");
    expect(section).toContain('identity_setup: "This Bot');
    expect(read("src/components/StudioAgentWorkspacePanel.tsx")).toContain("<DeleteBotSection");
  });
});
