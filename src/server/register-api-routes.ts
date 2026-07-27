import type { Express } from "express";
import authRouter from "../routes/auth-routes";
import authOAuthBrowserBindingRouter from "../routes/auth-oauth-browser-binding";
import authOAuthRouter from "../routes/auth-oauth-routes";
import productEventRouter from "../routes/product-event-routes";
import oauthRouter from "../routes/oauth";
import agentRouter from "../routes/agent-routes-v2";
import agentTestRouter from "../routes/agent-test-routes";
import agentWorkspaceRouter from "../routes/agent-workspace-routes";
import qaV2Router from "../routes/qa-routes-v2";
import vapiRouter from "../routes/vapi-v2";
import healthRouter from "../routes/health-routes";
import aiStatusRouter from "../routes/ai-status-routes";
import openaiRealtimeRouter from "../routes/openai-realtime-routes";
import grokVoiceRouter from "../routes/grok-voice-routes";
import billingRouter from "../routes/billing-routes";
import { stripeRuntimeAllowanceRetryPreflight } from "../middleware/stripe-runtime-allowance-retry";
import billingPortalReadinessRouter from "../routes/billing-portal-readiness-routes";
import launchBillingCheckoutRouter from "../routes/launch-billing-checkout-routes";
import conversationBalanceRouter from "../routes/conversation-balance-routes";
import spendControlRouter from "../routes/spend-control-routes";
import auditRouter from "../routes/audit-routes";
import emailOutcomeRouter from "../routes/email-outcome-routes";
import emailSyncRouter from "../routes/email-sync-routes";
import accountRouter from "../routes/account-routes";
import accountExportGuardRouter from "../routes/account-export-guard-routes";
import userPreferenceGuardRouter from "../routes/user-preference-guard-routes";
import companyIdentitySettingsGuardRouter from "../routes/company-identity-settings-guard-routes";
import settingsPhoneGuardRouter from "../routes/settings-phone-guard-routes";
import settingsRouter from "../routes/settings-routes";
import postCallOutputRouter from "../routes/post-call-output-routes";
import carrierRouter from "../routes/carrier-routes";
import companyIdentityRouter from "../routes/company-identity-routes";
import teamRouter from "../routes/team-routes";
import emailRouter from "../routes/email-routes";
import dashboardRouter from "../routes/dashboard-routes";
import fleetRouter from "../routes/fleet-routes";
import calendarRouter from "../routes/calendar-routes";
import workspaceKnowledgeRouter from "../routes/workspace-knowledge-routes";
import icloudMailRouter from "../routes/icloud-mail-routes";
import emailUnsubscribeRouter from "../routes/email-unsubscribe-routes";
import shareableArtifactRouter from "../routes/shareable-artifact-routes";
import marketingRuntimeRouter from "../routes/marketing-runtime-routes";
import metaWebhookRouter from "../routes/meta-webhook-routes";
import twilioWebhookRouter from "../routes/twilio-webhook";
import escalationRouter from "../routes/escalation-routes";
import smsRouter from "../routes/sms-routes";
import webhookRouter from "../routes/webhook-routes";
import intakeRouter from "../routes/intake-routes";
import supportRouter from "../routes/support-routes";
import jobRouter from "../routes/job-routes";
import mobileRouter from "../routes/mobile-routes";
import videoPresenterRouter from "../routes/video-presenter-routes";
import activationRouter from "../routes/activation-routes";
import outboundRouter from "../routes/outbound-routes";
import cadenceRouter from "../routes/cadence-routes";
import campaignRouter from "../routes/campaign-routes";
import complianceRouter from "../routes/compliance-routes";
import knowledgeRouter from "../routes/knowledge-routes";
import learningRouter from "../routes/learning-routes";
import openapiRouter from "../routes/openapi-routes";
import supervisorRouter from "../routes/supervisor-routes";
import voiceObservabilityRouter from "../routes/voice-observability-routes";
import insightsRouter from "../routes/insights-routes";
import pipelineRouter from "../routes/pipeline-routes";
import dailyBriefRouter from "../routes/daily-brief-routes";
import quotaRouter from "../routes/quota-routes";
import goalsRouter from "../routes/goals-routes";
import browserHandoffRouter from "../routes/browser-handoff-routes";
import adminSeedDemoRouter from "../routes/admin-seed-demo-routes";
import soc2Router from "../routes/soc2-routes";
import integrationsCertRouter from "../routes/integrations-cert-routes";
import gatewayCatalogRouter from "../routes/gateway-catalog-routes";

/**
 * Canonical API route order.
 *
 * Express resolves routes in registration order. This module preserves the
 * established production precedence while making it explicit and reviewable.
 */
export function registerApiRoutes(app: Express): void {
  app.use("/api/health", healthRouter);
  app.use(aiStatusRouter);
  app.use(openaiRealtimeRouter);
  app.use(grokVoiceRouter);
  app.use(videoPresenterRouter);
  // Must precede the sign-in OAuth router: it binds provider state to the
  // initiating browser cookie before the canonical callbacks claim the nonce.
  app.use(authOAuthBrowserBindingRouter);
  app.use(authOAuthRouter);
  app.use(authRouter);
  app.use(oauthRouter);
  app.use(productEventRouter);
  app.use(agentRouter);
  app.use(agentTestRouter);
  app.use(agentWorkspaceRouter);
  app.use(browserHandoffRouter);
  app.use(vapiRouter);
  app.use(accountRouter);
  // These terminal/guard writers must precede the broad legacy settings router.
  app.use(userPreferenceGuardRouter);
  app.use(companyIdentitySettingsGuardRouter);
  app.use(settingsPhoneGuardRouter);
  app.use(accountExportGuardRouter);
  app.use(settingsRouter);
  app.use(postCallOutputRouter);
  app.use(carrierRouter);
  app.use(companyIdentityRouter);
  app.use(teamRouter);
  app.use(spendControlRouter);
  // Audit/AI-spend ledger: /api/audit/summary(/events/stats/export), plus a
  // legacy /api/spend/budget GET that's intentionally shadowed by
  // spendControlRouter's real handler above (registration order matters --
  // this router must stay mounted after spendControlRouter).
  app.use(auditRouter);
  app.use(conversationBalanceRouter);
  app.use(emailOutcomeRouter);
  app.use(emailSyncRouter);
  // Sole owners for plan checkout and customer portal. Do not re-register these
  // paths on billingRouter — shadowed duplicates previously revived retired
  // prices, /admin return URLs, and unconfigured Stripe Dashboard portals.
  app.use(launchBillingCheckoutRouter);
  app.use(billingPortalReadinessRouter);
  // Financial-integrity preflight for subscription refunds/disputes. It runs on
  // the same raw-body Stripe path before the legacy billing router and only
  // acknowledges after the idempotent Runtime Allowance reversal succeeds.
  app.use("/api/stripe-webhook", stripeRuntimeAllowanceRetryPreflight);
  app.use("/api", billingRouter);
  app.use(emailRouter);
  // Dashboard data plane: /api/dashboard/*, /api/calls, /api/appointments,
  // /api/nav-counts, /api/export/:type.csv -- Overview and Phone read these.
  app.use(dashboardRouter);
  // Assistants data plane: /api/Assistants/presence(/stream), /tasks,
  // /activity, /seed, plus /api/triage. Powers Phone's live-call data
  // (usePresenceSignals) and is documented in the public OpenAPI spec --
  // must stay registered or both go silently 404.
  app.use(fleetRouter);
  app.use(calendarRouter);
  app.use(workspaceKnowledgeRouter);
  app.use(icloudMailRouter);
  app.use(emailUnsubscribeRouter);
  app.use(shareableArtifactRouter);
  app.use(metaWebhookRouter);
  // Twilio inbound SMS receiver (/api/twilio-webhook/*) -- signature-verified,
  // TCPA opt-out keywords. The Carrier panel hands this URL to customers.
  app.use(twilioWebhookRouter);
  // POST /api/escalate -- Vapi escalate_to_human tool receiver for the four
  // customer-service voice agents (Sarah/Liam/Tyler/Maya). Auth via shared
  // VAPI_WEBHOOK_SECRET. Missing this mount silently 404s every in-call
  // escalation, so the route must stay registered.
  app.use(escalationRouter);
  // SMS threads power the Inbox SMS tab (/api/sms/threads*).
  app.use(smsRouter);
  // Tenant webhook management -- mounted after metaWebhookRouter so the
  // public /api/webhooks/meta/leads receiver keeps precedence.
  app.use("/api/webhooks", webhookRouter);
  // Intake keys + key-authenticated public lead capture (/api/intake/*).
  app.use("/api/intake", intakeRouter);
  // Public support/contact ticket form (/api/support/ticket) -- rate-limited.
  app.use(supportRouter);
  // Job queue + the cron-driven operations sweep (/api/jobs/sweep): retention
  // purges, deletion queue, trial expiry, webhook retries, queue draining.
  app.use("/api/jobs", jobRouter);
  // Native app data plane (/api/mobile/*) -- every route is session-guarded.
  app.use(mobileRouter);
  app.use(marketingRuntimeRouter);
  app.use(activationRouter);
  app.use(outboundRouter);
  app.use("/api/qa", qaV2Router);
  app.use(cadenceRouter);
  app.use(campaignRouter);
  app.use(complianceRouter);
  app.use(knowledgeRouter);
  app.use(learningRouter);
  // The public contract is advertised and consumed at /api/openapi.json.
  app.use("/api", openapiRouter);
  app.use(supervisorRouter);
  // Insights data plane: funnel, heatmap, leaderboard, topics, failure-modes, daily-brief.
  app.use(insightsRouter);
  app.use(dailyBriefRouter);
  // Pipeline kanban + campaign attribution for Insights Attribution tab.
  app.use(pipelineRouter);
  app.use("/api/quotas", quotaRouter);
  app.use("/api/goals", goalsRouter);
  app.use(adminSeedDemoRouter);
  app.use(voiceObservabilityRouter);
  // SOC2 evidence endpoints (/api/soc2/access-review, /evidence-pack) --
  // authenticateUser + requirePermission("audit.read"), cited as a live
  // control by docs/soc2-policies.md.
  app.use(soc2Router);
  // Public trust-page data source (/api/integrations/certified) -- no auth,
  // IP rate-limited.
  app.use(integrationsCertRouter);
  // AI Gateway model catalog (/api/model-catalog) -- authenticateUser only.
  app.use(gatewayCatalogRouter);
}
