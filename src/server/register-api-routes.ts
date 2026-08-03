import type { Express } from "express";
import authRouter from "../routes/auth-routes";
import authOAuthBrowserBindingRouter from "../routes/auth-oauth-browser-binding";
import authOAuthExchangeAtomicRouter from "../routes/auth-oauth-exchange-atomic-routes";
import authOAuthRouter from "../routes/auth-oauth-routes";
import authSessionHardeningRouter from "../routes/auth-session-hardening-routes";
import productEventRouter from "../routes/product-event-routes";
import oauthRouter from "../routes/oauth";
import agentRouter from "../routes/agent-routes-v2";
import websiteKnowledgeRouter from "../routes/website-knowledge-routes";
import agentTestRouter from "../routes/agent-test-routes";
import agentWorkspaceRouter from "../routes/agent-workspace-routes";
import qaV2Router from "../routes/qa-routes-v2";
import vapiRouter from "../routes/vapi-v2";
import healthRouter from "../routes/health-routes";
import aiStatusRouter from "../routes/ai-status-routes";
import openaiRealtimeRouter from "../routes/openai-realtime-routes";
import grokVoiceRouter from "../routes/grok-voice-routes";
import voicesRouter from "../routes/voices-routes";
import billingRouter from "../routes/billing-routes";
import extraAgentBillingAtomicRouter from "../routes/extra-agent-billing-atomic-routes";
import { stripeRuntimeAllowanceRetryPreflight } from "../middleware/stripe-runtime-allowance-retry";
import { showcasePromptTruthGuard } from "../lib/showcase-prompt-truth-guard";
import billingPortalReadinessRouter from "../routes/billing-portal-readiness-routes";
import launchBillingCheckoutAtomicRouter from "../routes/launch-billing-checkout-atomic-routes";
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
import phoneNumberReleaseRouter from "../routes/phone-number-release-routes";
import carrierRouter from "../routes/carrier-routes";
import companyIdentityRouter from "../routes/company-identity-routes";
import sharedWorkspaceReadinessRouter from "../routes/shared-workspace-readiness-routes";
import teamRouter from "../routes/team-routes";
import emailRouter from "../routes/email-routes";
import dashboardRouter from "../routes/dashboard-routes";
import callRecordingRouter from "../routes/call-recording-routes";
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
import webhookTestRouter from "../routes/webhook-test-routes";
import webhookRouter from "../routes/webhook-routes";
import intakeRouter from "../routes/intake-routes";
import supportRouter from "../routes/support-routes";
import jobRouter from "../routes/job-routes";
import mobileRouter from "../routes/mobile-routes";
import videoPresenterRouter from "../routes/video-presenter-routes";
import activationRouter from "../routes/activation-routes";
import outboundDialAtomicRouter from "../routes/outbound-dial-atomic-routes";
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

/** Canonical API route order. Express resolves routes in registration order. */
export function registerApiRoutes(app: Express): void {
  app.use("/api/health", healthRouter);
  app.use(aiStatusRouter);
  app.use(openaiRealtimeRouter);
  app.use(grokVoiceRouter);
  app.use(voicesRouter);
  app.use(videoPresenterRouter);

  // Atomic browser-bound exchange owns this exact path before the broader OAuth
  // middleware and legacy callback router. Provider start/callback requests still
  // flow through the browser-binding middleware, which also moves bridge values
  // from query parameters into URL fragments.
  app.use(authOAuthExchangeAtomicRouter);
  app.use(authOAuthBrowserBindingRouter);
  app.use(authOAuthRouter);
  // Revocation-aware session routes shadow their legacy equivalents.
  app.use(authSessionHardeningRouter);
  app.use(authRouter);

  app.use(oauthRouter);
  app.use(productEventRouter);
  app.use(agentRouter);
  app.use(websiteKnowledgeRouter);
  app.use(agentTestRouter);
  app.use(agentWorkspaceRouter);
  app.use(browserHandoffRouter);
  // Public showcase assistants can be returned dynamically by the webhook.
  // Sanitize and validate that payload before the Vapi router writes it.
  app.use("/api/vapi-webhook", showcasePromptTruthGuard);
  app.use(vapiRouter);
  app.use(accountRouter);
  app.use(userPreferenceGuardRouter);
  app.use(companyIdentitySettingsGuardRouter);
  app.use(settingsPhoneGuardRouter);
  app.use(accountExportGuardRouter);
  app.use(settingsRouter);
  app.use(postCallOutputRouter);
  app.use(phoneNumberReleaseRouter);
  app.use(carrierRouter);
  app.use(companyIdentityRouter);
  // Shared-workspace tables/functions are installed, but collaboration remains
  // terminally gated until the actor-id/tenant-id data plane is certified.
  app.use(sharedWorkspaceReadinessRouter);
  app.use(teamRouter);
  app.use(spendControlRouter);
  app.use(auditRouter);
  app.use(conversationBalanceRouter);
  app.use(emailOutcomeRouter);
  app.use(emailSyncRouter);

  // Durable idempotent Checkout owner precedes the prior canonical implementation.
  app.use(launchBillingCheckoutAtomicRouter);
  app.use(launchBillingCheckoutRouter);
  app.use(billingPortalReadinessRouter);
  app.use("/api/stripe-webhook", stripeRuntimeAllowanceRetryPreflight);
  app.use("/api/billing/extra-agents", extraAgentBillingAtomicRouter);
  app.use("/api", billingRouter);

  app.use(emailRouter);
  app.use(callRecordingRouter);
  app.use(dashboardRouter);
  app.use(fleetRouter);
  app.use(calendarRouter);
  app.use(workspaceKnowledgeRouter);
  app.use(icloudMailRouter);
  app.use(emailUnsubscribeRouter);
  app.use(shareableArtifactRouter);
  app.use(metaWebhookRouter);
  app.use(twilioWebhookRouter);
  app.use(escalationRouter);
  app.use(smsRouter);

  // Target-specific test delivery owns /:id/test before the broad webhook router.
  app.use("/api/webhooks", webhookTestRouter);
  app.use("/api/webhooks", webhookRouter);

  app.use("/api/intake", intakeRouter);
  app.use(supportRouter);
  app.use("/api/jobs", jobRouter);
  app.use(mobileRouter);
  app.use(marketingRuntimeRouter);
  app.use(activationRouter);

  // Durable per-number reservations own manual dial before the broad outbound router.
  app.use(outboundDialAtomicRouter);
  app.use(outboundRouter);

  app.use("/api/qa", qaV2Router);
  app.use(cadenceRouter);
  app.use(campaignRouter);
  app.use(complianceRouter);
  app.use(knowledgeRouter);
  app.use(learningRouter);
  app.use("/api", openapiRouter);
  app.use(supervisorRouter);
  app.use(insightsRouter);
  app.use(dailyBriefRouter);
  app.use(pipelineRouter);
  app.use("/api/quotas", quotaRouter);
  app.use("/api/goals", goalsRouter);
  app.use(adminSeedDemoRouter);
  app.use(voiceObservabilityRouter);
  app.use(soc2Router);
  app.use(integrationsCertRouter);
  app.use(gatewayCatalogRouter);
}
