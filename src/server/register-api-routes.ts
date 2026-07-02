import type { Express } from "express";
import authRouter from "../routes/auth-routes";
import authOAuthRouter from "../routes/auth-oauth-routes";
import oauthRouter from "../routes/oauth";
import agentRouter from "../routes/agent-routes-v2";
import agentWorkspaceRouter from "../routes/agent-workspace-routes";
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
import dashboardRouter from "../routes/dashboard-routes";
import calendarRouter from "../routes/calendar-routes";
import workspaceKnowledgeRouter from "../routes/workspace-knowledge-routes";
import icloudMailRouter from "../routes/icloud-mail-routes";
import emailUnsubscribeRouter from "../routes/email-unsubscribe-routes";
import marketingRuntimeRouter from "../routes/marketing-runtime-routes";
import metaWebhookRouter from "../routes/meta-webhook-routes";
import smsRouter from "../routes/sms-routes";
import webhookRouter from "../routes/webhook-routes";
import intakeRouter from "../routes/intake-routes";

/**
 * Canonical API route order.
 *
 * Express resolves routes in registration order. This module preserves the
 * established production precedence while making it explicit and reviewable.
 */
export function registerApiRoutes(app: Express): void {
  app.use("/api/health", healthRouter);
  app.use(openaiRealtimeRouter);
  app.use(grokVoiceRouter);
  app.use(authOAuthRouter);
  app.use(authRouter);
  app.use(oauthRouter);
  app.use(agentRouter);
  app.use(agentWorkspaceRouter);
  app.use("/api/qa", qaRouter);
  app.use(vapiRouter);
  app.use(voicesRouter);
  app.use(pronunciationRouter);
  app.use(elevenlabsWebhookRouter);
  app.use(accountRouter);
  app.use(settingsRouter);
  app.use(carrierRouter);
  app.use(teamRouter);
  app.use(spendControlRouter);
  app.use(conversationBalanceRouter);
  app.use(emailOutcomeRouter);
  app.use(emailSyncRouter);
  app.use(subscriptionCheckoutGuardRouter);
  app.use("/api", billingRouter);
  app.use(emailRouter);
  // Dashboard data plane: /api/dashboard/*, /api/calls, /api/appointments,
  // /api/nav-counts, /api/export/:type.csv — Overview and Call Logs read these.
  app.use(dashboardRouter);
  app.use(calendarRouter);
  app.use(workspaceKnowledgeRouter);
  app.use(icloudMailRouter);
  app.use(emailUnsubscribeRouter);
  app.use(metaWebhookRouter);
  // SMS threads power the Inbox SMS tab (/api/sms/threads*).
  app.use(smsRouter);
  // Tenant webhook management — mounted after metaWebhookRouter so the
  // public /api/webhooks/meta/leads receiver keeps precedence.
  app.use("/api/webhooks", webhookRouter);
  // Intake keys + key-authenticated public lead capture (/api/intake/*).
  app.use("/api/intake", intakeRouter);
  app.use(marketingRuntimeRouter);
}
