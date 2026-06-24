import type { Express } from "express";
import authRouter from "../routes/auth-routes";
import authOAuthRouter from "../routes/auth-oauth-routes";
import oauthRouter from "../routes/oauth";
import agentRouter from "../routes/agent-routes";
import qaRouter from "../routes/qa-routes";
import vapiRouter from "../routes/vapi-v2";
import healthRouter from "../routes/health-routes";
import openaiRealtimeRouter from "../routes/openai-realtime-routes";
import grokVoiceRouter from "../routes/grok-voice-routes";
import voicesRouter from "../routes/voices-routes";
import pronunciationRouter from "../routes/pronunciation-routes";
import elevenlabsWebhookRouter from "../routes/webhooks-elevenlabs-routes";
import billingRouter from "../routes/billing-routes";
import subscriptionCheckoutGuardRouter from "../routes/subscription-checkout-guard-routes";
import conversationBalanceRouter from "../routes/conversation-balance-routes";
import spendControlRouter from "../routes/spend-control-routes";
import emailOutcomeRouter from "../routes/email-outcome-routes";
import emailSyncRouter from "../routes/email-sync-routes";
import accountRouter from "../routes/account-routes";
import settingsRouter from "../routes/settings-routes";
import carrierRouter from "../routes/carrier-routes";
import teamRouter from "../routes/team-routes";
import emailRouter from "../routes/email-routes";
import calendarRouter from "../routes/calendar-routes";
import workspaceKnowledgeRouter from "../routes/workspace-knowledge-routes";
import icloudMailRouter from "../routes/icloud-mail-routes";
import emailUnsubscribeRouter from "../routes/email-unsubscribe-routes";
import marketingRuntimeRouter from "../routes/marketing-runtime-routes";
import metaWebhookRouter from "../routes/meta-webhook-routes";

/**
 * Canonical API route order.
 *
 * Express resolves in registration order, so specific endpoints must appear
 * before broad routers that share their prefixes. Keep all route composition
 * here; the bootstrap owns only middleware, lifecycle, and error handling.
 */
export function registerApiRoutes(app: Express): void {
  app.use("/api/health", healthRouter);

  // Voice and webhook endpoints own their explicit paths and raw-body handling.
  app.use(openaiRealtimeRouter);
  app.use(grokVoiceRouter);
  app.use(vapiRouter);
  app.use(voicesRouter);
  app.use(pronunciationRouter);
  app.use(elevenlabsWebhookRouter);
  app.use(metaWebhookRouter);

  // Identity must precede all tenant-scoped operational routes.
  app.use(authOAuthRouter);
  app.use(authRouter);
  app.use(oauthRouter);

  // Agent lifecycle and supporting workspace operations.
  app.use(agentRouter);
  app.use("/api/qa", qaRouter);
  app.use(accountRouter);
  app.use(settingsRouter);
  app.use(carrierRouter);
  app.use(teamRouter);
  app.use(workspaceKnowledgeRouter);

  // Mail-specific live routes stay ahead of the historic aggregate router.
  app.use(emailOutcomeRouter);
  app.use(emailSyncRouter);
  app.use(icloudMailRouter);
  app.use(emailUnsubscribeRouter);
  app.use(emailRouter);
  app.use(calendarRouter);

  // Billing and quotas are intentionally grouped after identity.
  app.use(spendControlRouter);
  app.use(conversationBalanceRouter);
  app.use(subscriptionCheckoutGuardRouter);
  app.use("/api", billingRouter);

  // Public/runtime integrations are intentionally last among feature routers.
  app.use(marketingRuntimeRouter);
}
