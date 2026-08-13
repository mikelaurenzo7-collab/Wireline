import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The money-movement layer (Stripe, ledger, refunds) was already fortress-
 * grade; the exposure was the AI/telephony COGS-metering layer — paths that
 * reached paid providers WITHOUT passing through metering or caps. This
 * contract pins each of those paths closed:
 *
 * - The workspace composer + stream + PDF extraction called Claude with no
 *   cost accounting (invisible to enforceSpendCap and margin analytics) and
 *   the PDF route had no rate limit at all.
 * - Free/trial tenants had no spendBudgets row, so enforceSpendCap passed
 *   everything while the usage UI displayed a fictional "hard cap".
 * - Realtime simulation sessions (Grok + OpenAI) minted vendor-metered
 *   secrets with only a per-minute rate limit — no daily aggregate.
 * - Inbound calls for insolvent tenants ran the full assistant unbounded.
 */
describe("AI cost-protection contract", () => {
  it("workspace composer, stream, and PDF routes are metered and capped", () => {
    const source = read("src/routes/agent-workspace-routes.ts");
    const occurrences = source.match(/withAudit\("workspace"\)/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    expect(source.match(/enforceSpendCap/g)!.length).toBeGreaterThanOrEqual(4); // import + 3 mounts
    const pdfRoute = source.slice(source.indexOf('"/api/agents/:id/workspace/files"'));
    expect(pdfRoute.slice(0, 600)).toContain("claudeRateLimiter");
  });

  it("meters every AI setup surface and caps the simulation one", () => {
    // Policy: RECORD cost everywhere a paid model is reached, but only HARD CAP
    // the simulation surface. The Free Builder budget is a private-simulation
    // allowance (migration 0134); capping configuration work would strand an
    // Account Holder mid-onboarding once the allowance is spent.
    //
    // withAudit must also sit AFTER the authenticating middleware: it keys the
    // persisted row on req.user.id at "finish", so mounting it earlier silently
    // drops every record.
    const agentTest = read("src/routes/agent-test-routes.ts");
    const testRoute = agentTest.slice(
      agentTest.indexOf('"/api/agents/:id/test/stream"'),
      agentTest.indexOf("async (req: AuthenticatedRequest"),
    );
    expect(testRoute).toContain("enforceSpendCap");
    expect(testRoute).toContain('withAudit("agent-test")');
    expect(testRoute.indexOf("authenticateEventStream")).toBeLessThan(
      testRoute.indexOf('withAudit("agent-test")'),
    );

    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    for (const [path, label] of [
      ["/api/train/extract", "train-extract"],
      ["/api/agent-config/:id/assets", "asset-extract"],
    ] as const) {
      const start = agentRoutes.indexOf(`"${path}"`);
      const block = agentRoutes.slice(start, agentRoutes.indexOf("async (req", start));
      expect(block, path).toContain(`withAudit("${label}")`);
      expect(block.indexOf("authenticateUser")).toBeLessThan(
        block.indexOf(`withAudit("${label}")`),
      );
      // Configuration work is measured, never hard-blocked.
      expect(block, path).not.toContain("enforceSpendCap");
    }

    const website = read("src/routes/website-knowledge-routes.ts");
    const websiteRoute = website.slice(
      website.indexOf('"/api/agent-config/:id/website"'),
      website.indexOf("async (req: AuthenticatedRequest"),
    );
    expect(websiteRoute).toContain('withAudit("website-import")');
    expect(websiteRoute).not.toContain("enforceSpendCap");
    expect(websiteRoute.indexOf("authenticateUser")).toBeLessThan(
      websiteRoute.indexOf('withAudit("website-import")'),
    );
  });

  it("caps forced daily-brief composes and meters the cron sweep per tenant", () => {
    const dailyBrief = read("src/routes/daily-brief-routes.ts");

    // send-now runs the same computeDailyBrief model call as
    // GET /api/insights/daily-brief, so it must carry the same cap — metering
    // without capping leaves a forced-compose bypass for a tenant over its limit.
    const sendNowStart = dailyBrief.indexOf('"/api/daily-brief/send-now"');
    const sendNow = dailyBrief.slice(
      sendNowStart,
      dailyBrief.indexOf("async (req: AuthenticatedRequest", sendNowStart),
    );
    expect(sendNow).toContain("enforceSpendCap");
    expect(sendNow).toContain('withAudit("daily-brief")');

    // The cron sweep has no req.user, so withAudit cannot attribute it. It must
    // capture records per tenant and persist them against that tenant, or the
    // highest-volume paid path in the product records nothing at all.
    const cronStart = dailyBrief.indexOf("async function runDailyBriefSchedule");
    const cron = dailyBrief.slice(
      cronStart,
      dailyBrief.indexOf('router.get("/api/daily-brief/schedule"', cronStart),
    );
    expect(cron).toContain("createAuditContext()");
    expect(cron).toContain("runInAuditContext(auditContext");
    expect(cron).toContain("persistRuntimeAuditRecords({");
    expect(cron).toContain("userId: uid");
    // Paid model records survive a downstream Gmail/send failure.
    expect(cron).toMatch(/finally\s*\{[\s\S]*persistRuntimeAuditRecords/);
  });

  it("records vision-asset usage that bypasses the structured runtime", () => {
    // extractImageAsset calls the Responses API through raw fetch, so it never
    // passes through ai-structured's recordUsage. Without an explicit call the
    // route's withAudit wrapper captures nothing and vision COGS is invisible.
    const agentRoutes = read("src/routes/agent-routes-v2.ts");
    const imagePath = agentRoutes.slice(
      agentRoutes.indexOf("async function extractImageAsset"),
      agentRoutes.indexOf('router.get("/api/agents"'),
    );
    expect(imagePath).toContain("recordUsage(");
    expect(imagePath).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
  });

  it("records the fixed-price business artifact against the tenant that ordered it", () => {
    // The artifact/scheduled-report jobs run the single most expensive call in
    // the product — Responses + code_interpreter, 8k max output tokens — from a
    // queue worker with no request, so neither withAudit nor ai-structured's
    // recordUsage was ever in the path and the cost reached no audit row.
    //
    // These are sold at a FIXED reserve per format, so the failure mode is not
    // an unbilled call but an unmeasured one: nothing can detect the flat price
    // no longer covering the model.
    const artifact = read("src/lib/openai-post-call-artifact.ts");
    expect(artifact).toContain('import { recordUsage } from "./ai-audit"');
    // Recorded before the ok-check, so a billed-then-rejected response still lands.
    const call = artifact.slice(
      artifact.indexOf("const artifactModel ="),
      artifact.indexOf("if (!response.ok)"),
    );
    expect(call).toContain("recordUsage(");
    expect(call).toContain("artifactModel");

    const worker = read("src/lib/job-worker.ts");
    const reservation = worker.slice(
      worker.indexOf("async function withRuntimeReservation"),
      worker.indexOf("async function handlePostCallArtifact"),
    );
    // A queue worker has no req.user, so the records must be captured and
    // persisted against the job's tenant explicitly.
    expect(reservation).toContain("runInAuditContext(auditContext, () => operation())");
    expect(reservation).toContain("persistRuntimeAuditRecords({");
    expect(reservation).toContain("userId,");
    // withAuditCapture drops its records when the operation throws, and the
    // billed-then-failed response is exactly the case worth recording — so the
    // context is held directly and flushed in a finally.
    expect(reservation).not.toMatch(/withAuditCapture\(/);
    expect(reservation).toMatch(/\}\s*finally\s*\{[\s\S]*persistRuntimeAuditRecords/);
    // An audit write must never mask the job's own outcome.
    expect(reservation).toMatch(/persistRuntimeAuditRecords\(\{[\s\S]*?\}\)\.catch\(/);
  });

  it("signup and OAuth reconciliation seed the correct AI spend budget transactionally", () => {
    const trialGate = read("src/lib/trial-gate.ts");
    expect(trialGate).toContain("ensureDefaultAiSpendBudget");
    expect(trialGate).toContain("schema.subscriptions.status");
    expect(trialGate).toContain('subscription?.status === "active"');
    expect(trialGate).toContain('subscription?.status === "trialing"');
    expect(trialGate).toContain("ensureDefaultAiSpendBudget(userId, fundedPlanId, tx)");
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    expect(snapshot).toMatch(/executor:\s*any\s*=\s*drizzle/);
    expect(snapshot).toMatch(/await executor\s*\.insert\(schema\.spendBudgets\)/);
    expect(snapshot).toMatch(/await executor\s*\.select/);
  });

  it("moves only managed defaults, preserves customer limits, and repairs disabled caps", () => {
    const snapshot = read("src/lib/workspace-usage-snapshot.ts");
    const routes = read("src/routes/spend-control-routes.ts");
    const entitlements = read("src/lib/plan-entitlements.ts");
    const validation = read("src/lib/api-validation-base.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");
    expect(snapshot).toContain("existing.managedDefault === true");
    expect(snapshot).toContain("managedDefault\n      ? limit");
    expect(routes).toContain("managedDefault: false");
    expect(read("drizzle/migrations/0118_spend_budget_managed_default.sql")).toContain(
      "managed_default boolean NOT NULL DEFAULT false",
    );
    expect(snapshot).toContain("Math.min(current, limit)");
    expect(snapshot).toContain("existing.hardCap === true");
    expect(routes).toContain("limit > maximumLimitUsd");
    expect(routes).toContain("The provider spend guard is always enabled with a hard cap.");
    expect(entitlements).toContain('status === "active" || status === "trialing"');
    expect(stripeHelpers).toMatch(
      /stripeStatus === "active" \|\| stripeStatus === "trialing"[\s\S]*spendBudgetPlanId/,
    );
    expect(stripeHelpers).toContain("await ensureDefaultAiSpendBudget(userId, spendBudgetPlanId)");
    expect(validation).toContain("hard_cap: z.boolean().default(true)");
  });

  it("realtime simulation sessions carry a daily minute quota", () => {
    const quotas = read("src/lib/tenant-quotas.ts");
    const declarations = quotas.match(/simulation_minutes_daily: \d+/g) || [];
    expect(declarations.length).toBe(5);
    for (const declaration of declarations) {
      expect(Number(declaration.split(":")[1])).toBeGreaterThan(0);
    }
    expect(quotas).toContain('"simulation_minutes_daily",');
    expect(read("src/routes/grok-voice-routes.ts")).toContain("simulationMinuteQuota");
    expect(read("src/routes/openai-realtime-routes.ts")).toContain("simulationMinuteQuota");

    // Every session mint charges a vendor-metered realtime secret on platform
    // keys, so a quota-tracker outage must refuse the mint (matching the
    // fail-closed posture of the dial/SMS/campaign spend buckets), not hand
    // out unmetered sessions while accounting is blind.
    const limits = read("src/middleware/api-rate-limits.ts");
    const quotaFn = limits.slice(
      limits.indexOf("export async function simulationMinuteQuota"),
      limits.indexOf("interface RateLimitMiddleware"),
    );
    expect(quotaFn).toContain('"SIMULATION_QUOTA_UNAVAILABLE"');
    expect(quotaFn).toContain("res.status(503)");
    expect(quotaFn).not.toContain("allowing session");

    // The ChatGPT MCP simulation tool mints the same vendor-metered secrets
    // and must draw from the same daily quota — its hourly limiter alone
    // allowed 8 mints/hour all day, 64× the web path's ceiling.
    const mcpAccount = read("src/routes/chatgpt-mcp-account-routes.ts");
    const mcpSimulation = mcpAccount.slice(
      mcpAccount.indexOf('name === "start_private_voice_simulation"'),
      mcpAccount.indexOf('name === "list_wireline_agents"'),
    );
    expect(mcpSimulation).toContain(
      'checkAndIncrement(authed.userId, "simulation_minutes_daily", 5)',
    );
    expect(mcpSimulation.indexOf("checkAndIncrement")).toBeLessThan(
      mcpSimulation.indexOf("createOpenAIRealtimeClientSecret"),
    );
  });

  it("deep completion-grace debt routes inbound to a durable bounded take-a-message assistant", () => {
    const webhook = read("src/routes/vapi-v2.ts");
    expect(webhook).toContain("INBOUND_TAKE_MESSAGE_GRACE_USD");
    expect(webhook).toContain("getVoiceWalletSnapshot");
    // The fallback answers the same tenant line as the full assistant, so it
    // must receive that agent's compliance posture and business identity.
    expect(webhook).toMatch(
      /buildDurableTakeMessageAssistant\(\s*webhookAgentId,\s*agentVoiceName,\s*agentComplianceMode,\s*userSettings\?\.businessName,\s*\)/,
    );

    const helperStart = webhook.indexOf("function buildDurableTakeMessageAssistant");
    const routeStart = webhook.indexOf('router.post("/api/vapi-webhook"');
    const helper = webhook.slice(helperStart, routeStart);
    expect(helper).toContain("maxDurationSeconds: 300");
    // The degraded assistant must inherit the same privacy-first artifact
    // policy as the full tenant assistant: transcript/log evidence without
    // full-call audio, video, or packet capture.
    expect(helper).toContain("buildVapiTranscriptOnlyArtifactPlan()");
    expect(helper).toContain("artifactPlan,");
    expect(helper).toContain("recordingEnabled: artifactPlan.recordingEnabled");
    expect(helper).toContain("complianceFirstMessagePrefix(");
    expect(helper).toContain("firstMessage: `${disclosurePrefix}");
    expect(helper).toContain('name: "create_followup_task"');
    expect(helper).toContain(
      "Promise follow-up only if the result explicitly confirms the task was created",
    );
    expect(helper).toContain("promise follow-up only if the tool explicitly confirms creation");
    expect(helper).not.toContain("book_appointment");
  });
});
