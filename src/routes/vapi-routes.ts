import express, { Request, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import * as claudeBrain from "../lib/claude-brain";
import { drizzle, log, IS_PROD, auditLogger, fetchWithTimeout } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, or, ilike, not, inArray } from "drizzle-orm";
import {
  timingSafeEq,
  VAPI_WEBHOOK_SECRET,
  sanitizePhone,
  KNOWLEDGE_GAP_PREFIX,
  MAX_RUNTIME_LESSONS,
  ROLE_SPECIFIC_PROTOCOLS,
  buildCallerProfileBlock,
  OUTBOUND_ARCHETYPE_BY_ROLE,
  getArchetypeConfig,
  buildRoleToolDefs,
  PRESERVED_LEAD_STATUSES,
  SENTIMENT_ANGRY_SIGNALS,
  SENTIMENT_POSITIVE_SIGNALS,
} from "../lib/vapi-helpers";
import { buildAgentRuntimeContext, type AgentRuntimeProfile } from "../lib/agent-runtime";
import { buildCustomerIntelBlock } from "../lib/customer-intel";
import { SentryEvents } from "../lib/sentry-events";
import { getErrorMessage } from "../lib/server-utils";
import { persistClaudeAuditRecords } from "../middleware/audit-middleware";
import {
  buildCallCompletedOutcome,
  dispatchWebhook,
  type WirelineCallCompletedOutcome,
} from "../lib/webhook-helpers";
import { analyzeLiveSentiment } from "../lib/gemini-brain";
import { IntegrationService } from "../lib/integrations";
import { CRMService } from "../lib/crm-service";
import { createMeeting as createZoomMeeting } from "../lib/zoom-service";
import { NotificationService } from "../lib/notifications";
import { postMessage as slackPostMessage, getDefaultChannel } from "../lib/slack-service";
import {
  lookupOrder as shopifyLookupOrder,
  searchProducts as shopifySearchProducts,
  lookupCustomer as shopifyLookupCustomer,
  startReturn as shopifyStartReturn,
  cancelOrder as shopifyCancelOrder,
  updateOrderShippingAddress as shopifyUpdateAddress,
} from "../lib/shopify-service";
import { normalizeDncPhone } from "../lib/compliance";
import { lookupTenantPhoneNumber, sendTenantMessage } from "../lib/twilio-service";
import { resolveAgentTools } from "../lib/agent-capabilities";
import { resolveVapiWebhookAgent } from "../lib/vapi-webhook-agent";
import { enqueue } from "../lib/job-queue";
import {
  getConsentRuleForPhone,
  buildConsentLedgerRow,
  detectOptOut,
  CONSENT_RULE_VERSION,
} from "../lib/tcpa-consent";
import { handleEndOfCallReport } from "../lib/vapi-handlers";
import { buildVapiAssistant } from "../lib/vapi-assistant-factory";
import { shouldQueueWebhook } from "../lib/vapi-webhook-queue";
import {
  performMidCallVoiceSwap,
  shouldSwapForCall,
  clearSwapDedupe,
  logSwapAttempt,
} from "../lib/vapi-voice-swap";
import {
  handleCreateAccount,
  handleSendPaymentLink,
  handleSendSignupLink,
} from "../lib/vapi-tool-handlers";

// The extraction from server.ts is now complete. The Gemini post-call lesson
// extraction, TCPA consent ledger writer, and webhook dispatch are fully
// integrated into the end-of-call-report handler.

const router = express.Router();
let _warnedAboutVapiSecret = false;
const DEFAULT_AGENT_ROLE = "customer_service";

router.post("/api/vapi-webhook", async (req, res) => {
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (IS_PROD) {
      log.error("VAPI_WEBHOOK_SECRET unset in production — rejecting webhook");
      return res.status(503).json({ error: "Webhook auth not configured." });
    }
    if (!_warnedAboutVapiSecret) {
      log.warn("VAPI_WEBHOOK_SECRET unset — accepting all webhook requests (dev only)");
      _warnedAboutVapiSecret = true;
    }
  } else if (!timingSafeEq(provided, VAPI_WEBHOOK_SECRET)) {
    // Include ip + signature prefix for abuse pattern detection
    // (volume probing, replay attacks). Bounded leak — the prefix
    // alone is not enough to reconstruct the secret.
    log.warn("Rejected Vapi webhook with bad/missing signature", {
      ip: req.ip,
      sig_prefix: provided ? provided.slice(0, 8) : null,
      ts: Date.now(),
    });
    return res.status(401).json({ error: "Invalid webhook signature." });
  }

  const payload = req.body as Record<string, unknown>;
  const queryAgentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const routed = await resolveVapiWebhookAgent({ payload, queryAgentId });
  if (!routed.ok) {
    return res
      .status((routed as { status: number }).status)
      .json((routed as { body: Record<string, unknown> }).body);
  }

  const webhookAgentId = routed.webhookAgentId;
  const agent = { id: webhookAgentId, user_id: routed.agentUserId };
  const message = payload.message as Record<string, any> | undefined;

  const [userSettings] = await drizzle
    .select({
      subscriptionStatus: schema.settings.subscriptionStatus,
      voiceLlmProvider: schema.settings.voiceLlmProvider,
      voiceLlmModel: schema.settings.voiceLlmModel,
      twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
      twilioLookupEnabled: schema.settings.twilioLookupEnabled,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, agent.user_id))
    .limit(1);

  const subscriptionStatus = userSettings?.subscriptionStatus || "active";
  const voiceLlmProvider = userSettings?.voiceLlmProvider || "google";
  const voiceLlmModel = userSettings?.voiceLlmModel || "gemini-1.5-flash";

  if (subscriptionStatus !== "active") {
    if (message && message.type === "assistant-request") {
      return res.json({
        assistant: {
          firstMessage: "The automated service for this line is suspended.",
          model: {
            provider: "google",
            model: "gemini-1.5-flash",
            systemPrompt: "Explain suspension and end call.",
          },
        },
      });
    }
    return res.status(403).json({ error: "Access Denied" });
  }

  if (message && message.type === "assistant-request") {
    try {
      const assistant = await buildVapiAssistant({
        message: message as any,
        agent: agent as any,
        userSettings: userSettings as any,
      });
      return res.json({ assistant });
    } catch (e: any) {
      log.error("Vapi webhook config error", { agentId: webhookAgentId, error: e?.message });
      return res.json({
        assistant: {
          firstMessage: "I am having trouble connecting. Please try again.",
          model: {
            provider: "google",
            model: "gemini-1.5-flash",
            systemPrompt: "Apologize and hang up.",
          },
        },
      });
    }
  }

  if (message && message.type === "tool-calls") {
    const results = [];
    for (const toolCall of message.toolCalls) {
      if (toolCall.function.name === "create_fleet_task") {
        try {
          const { description, priority } = toolCall.function.arguments;
          const [task] = await drizzle
            .insert(schema.fleetTasks)
            .values({
              userId: agent?.user_id,
              agentId: webhookAgentId,
              taskType: "follow_up",
              description,
              priority: priority || "medium",
              status: "pending",
              sourceType: "phone_call",
              sourceId:
                (message.call as { id?: string } | undefined)?.id ||
                (payload.call as { id?: string } | undefined)?.id ||
                "in-call",
              targetChannel: "manual",
            })
            .returning({ id: schema.fleetTasks.id });

          results.push({
            toolCallId: toolCall.id,
            result: `Task ${task.id.split("-")[0]} created.`,
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to create task." });
        }
      }

      if (toolCall.function.name === "search_leads") {
        try {
          const { query } = toolCall.function.arguments;
          const safeQuery = String(query || "")
            .replace(/[^A-Za-z0-9 @.\-+]/g, "")
            .slice(0, 80);
          const leads = await drizzle
            .select({
              name: schema.outboundLeads.customerName,
              status: schema.outboundLeads.status,
              customerNumber: schema.outboundLeads.customerNumber,
              context: schema.outboundLeads.context,
            })
            .from(schema.outboundLeads)
            .where(
              and(
                eq(schema.outboundLeads.userId, agent?.user_id),
                or(
                  ilike(schema.outboundLeads.customerName, `%${safeQuery}%`),
                  ilike(schema.outboundLeads.customerNumber, `%${safeQuery}%`),
                ),
              ),
            )
            .limit(3);

          if (leads && leads.length > 0) {
            const summaries = leads.map(
              (l) => `${l.name} (${l.status}) | Phone: ${l.customerNumber || "N/A"}`,
            );
            results.push({
              toolCallId: toolCall.id,
              result: `Found records:\n${summaries.join("\n")}`,
            });
          } else {
            results.push({ toolCallId: toolCall.id, result: "No matching records found." });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Search failed." });
        }
      }

      if (toolCall.function.name === "update_lead_status") {
        try {
          const { status, notes } = toolCall.function.arguments;
          const customerPhone =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          if (customerPhone) {
            const safePhone = sanitizePhone(customerPhone);
            await drizzle
              .update(schema.outboundLeads)
              .set({ status, context: notes || "", lastCalledAt: new Date() })
              .where(
                and(
                  eq(schema.outboundLeads.userId, agent?.user_id),
                  ilike(schema.outboundLeads.customerNumber, `%${safePhone}%`),
                  not(inArray(schema.outboundLeads.status, PRESERVED_LEAD_STATUSES)),
                ),
              );
          }
          results.push({ toolCallId: toolCall.id, result: `Lead status updated to '${status}'.` });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Update failed." });
        }
      }

      if (toolCall.function.name === "send_email") {
        try {
          const { to_email, subject, body } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const success = await service.sendEmail({ to: to_email, subject, body });
          results.push({
            toolCallId: toolCall.id,
            result: success ? "Email sent." : "Failed to send email.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Email error." });
        }
      }

      // Platform-Resend signup-link tool — the showcase + demo agents
      // (Sarah, Liam, Marcus, etc.) call this when a caller asks for a
      // Wireline trial signup link. Distinct from `send_email` above,
      // which routes through the TENANT'S connected Google/Microsoft
      // OAuth account — showcase agents have no tenant so they need a
      // platform-level transport. Closes the "agent promised an email
      // but never sent it" gap Mike caught on the demo line.
      //
      // Core branch logic lives in src/lib/vapi-tool-handlers.ts so it
      // can be unit-tested with mocked transports — the route stays a
      // thin adapter (look up the agent name, inject deps).
      if (toolCall.function.name === "send_signup_link") {
        const { sendSignupLinkEmail } = await import("../lib/email-service");
        const agentNameRow = await drizzle
          .select({ name: schema.agents.name })
          .from(schema.agents)
          .where(eq(schema.agents.id, webhookAgentId))
          .limit(1);
        const { result } = await handleSendSignupLink(toolCall.function.arguments, {
          sendSignupLinkEmail,
          agentName: agentNameRow[0]?.name ?? undefined,
          log,
        });
        results.push({ toolCallId: toolCall.id, result });
      }

      // create_account — a Wireline employee signs a caller up by phone.
      // Creates the account with a random password + emails a
      // set-password link so the caller picks their own. Same
      // confirm-the-email guardrail as send_signup_link.
      if (toolCall.function.name === "create_account") {
        const { authService } = await import("../lib/auth-service");
        const { sendPasswordResetEmail } = await import("../lib/email-service");
        const crypto = await import("crypto");
        const { result } = await handleCreateAccount(toolCall.function.arguments, {
          signUp: (email, password, fullName) => authService.signUp(email, password, fullName),
          createPasswordResetToken: (email) => authService.createPasswordResetToken(email),
          sendPasswordResetEmail,
          randomPassword: () => crypto.randomBytes(24).toString("base64url"),
          log,
        });
        results.push({ toolCallId: toolCall.id, result });
      }

      // send_payment_link — emails the caller a checkout link for a
      // specific plan so they can pay + activate without friction.
      if (toolCall.function.name === "send_payment_link") {
        const { sendEmail } = await import("../lib/email-service");
        const { result } = await handleSendPaymentLink(toolCall.function.arguments, {
          sendEmail,
          log,
        });
        results.push({ toolCallId: toolCall.id, result });
      }

      if (toolCall.function.name === "send_text_message") {
        try {
          const { to_number, channel, message_body } = toolCall.function.arguments;
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const targetNumber = sanitizePhone(to_number || fallbackNumber);

          if (!targetNumber) {
            results.push({
              toolCallId: toolCall.id,
              result: "No destination number was available for that message.",
            });
          } else {
            const outcome = await sendTenantMessage(agent?.user_id, {
              to: targetNumber,
              body: message_body,
              channel: channel === "whatsapp" ? "whatsapp" : "sms",
            });
            results.push({
              toolCallId: toolCall.id,
              result: outcome.ok
                ? `${outcome.channel === "whatsapp" ? "WhatsApp" : "SMS"} sent to ${targetNumber}.`
                : outcome.reason || "Message send failed.",
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Text message error." });
        }
      }

      if (toolCall.function.name === "lookup_phone_number") {
        try {
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const targetNumber = sanitizePhone(
            toolCall.function.arguments?.phone_number || fallbackNumber,
          );

          if (!targetNumber) {
            results.push({
              toolCallId: toolCall.id,
              result: "No phone number was available to validate.",
            });
          } else {
            const lookup = await lookupTenantPhoneNumber(agent?.user_id, targetNumber);
            results.push({
              toolCallId: toolCall.id,
              result: lookup.ok
                ? `Lookup for ${lookup.phoneNumber || targetNumber}: valid=${lookup.valid ? "yes" : "no"}, line_type=${lookup.lineType || "unknown"}, carrier=${lookup.carrierName || "unknown"}.`
                : lookup.reason || "Phone lookup failed.",
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Phone lookup error." });
        }
      }

      if (toolCall.function.name === "add_to_dnc") {
        try {
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const rawPhone = String(
            toolCall.function.arguments?.phone_number || fallbackNumber || "",
          );
          const normalizedPhone = normalizeDncPhone(rawPhone);

          if (!normalizedPhone) {
            results.push({
              toolCallId: toolCall.id,
              result: "No valid phone number was available to suppress.",
            });
          } else {
            await drizzle
              .insert(schema.dncList)
              .values({
                userId: agent?.user_id,
                phone: normalizedPhone,
                phoneRaw: rawPhone,
                reason: toolCall.function.arguments?.reason || "agent opt-out",
                source: "agent_tool",
              })
              .onConflictDoNothing({ target: [schema.dncList.userId, schema.dncList.phone] });

            void auditLogger
              .logDnc("added", {
                userId: agent?.user_id,
                count: 1,
                metadata: {
                  phone: rawPhone,
                  source: "agent_tool",
                  reason: toolCall.function.arguments?.reason || null,
                },
              })
              .catch(() => {});

            // Real-time termination for the current call if it's the same number
            const { SentinelService } = await import("../services/sentinel");
            const sentinel = new SentinelService();
            void sentinel.terminateActiveCallsForNumber(normalizedPhone).catch(() => {});

            results.push({
              toolCallId: toolCall.id,
              result: `${rawPhone || normalizedPhone} is now on the Do Not Call list.`,
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "DNC update failed." });
        }
      }

      if (toolCall.function.name === "check_calendar_availability") {
        try {
          const { date } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);
          const result = await service.checkAvailability(date);
          results.push({ toolCallId: toolCall.id, result });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Calendar check failed." });
        }
      }

      if (toolCall.function.name === "book_appointment") {
        try {
          const { date, time, customer_name, service_type } = toolCall.function.arguments;
          const service = new IntegrationService(agent?.user_id);

          // Simple date/time parsing for now.
          const startTime = new Date(`${date} ${time}`).toISOString();
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          const title = `${service_type} for ${customer_name}`;

          const success = await service.bookAppointment({
            title,
            description: `Booked via Wireline AI Agent`,
            startTime,
            endTime,
            agentId: agent?.id,
          });
          if (success && agent?.user_id) {
            void dispatchWebhook(agent.user_id, "appointment.booked", {
              agent_id: agent.id,
              title,
              start_time: startTime,
              end_time: endTime,
              customer_name,
              service_type,
            });
            const slackCh = await getDefaultChannel(agent.user_id);
            if (slackCh) {
              void slackPostMessage(
                agent.user_id,
                slackCh,
                `📅 *Appointment booked*\n${title}\n${new Date(startTime).toLocaleString()} → ${new Date(endTime).toLocaleString()}`,
              );
            }
            // Operator SMS alert — positive event. Fires only when the
            // operator opted in (twilio_manager_alerts_enabled = true
            // + twilio_manager_alert_number set). Keeps the operator
            // in the loop on wins, not just escalations.
            try {
              const { NotificationService } = await import("../lib/notifications");
              const notif = new NotificationService(agent.user_id);
              void notif.sendUrgentAlert({
                title: "📅 Meeting booked",
                message: `${customer_name} · ${service_type} · ${new Date(startTime).toLocaleString()}`,
                callId: (message.call as { id?: string } | undefined)?.id,
              });
            } catch {
              /* best-effort; never block the tool response */
            }
          }
          results.push({
            toolCallId: toolCall.id,
            result: success ? "Appointment booked." : "Booking failed.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Booking error." });
        }
      }

      if (toolCall.function.name === "send_contract") {
        try {
          const { recipient_name, recipient_email, template_id } = toolCall.function.arguments;
          const { sendContract } = await import("../lib/docusign-service");
          const result = await sendContract({
            recipientName: recipient_name,
            recipientEmail: recipient_email,
            templateId: template_id,
          });
          results.push({
            toolCallId: toolCall.id,
            result: result
              ? `Contract sent. Envelope ID: ${result.envelopeId}`
              : "DocuSign not configured.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Contract sending error." });
        }
      }

      if (toolCall.function.name === "enrich_lead") {
        try {
          const { phone_number } = toolCall.function.arguments;
          const { enrichLead } = await import("../lib/apollo-service");
          const profile = await enrichLead(phone_number, agent?.user_id);
          if (profile) {
            results.push({
              toolCallId: toolCall.id,
              result: `Lead found: ${profile.first_name} ${profile.last_name}, ${profile.title} at ${profile.company}`,
            });
          } else {
            results.push({ toolCallId: toolCall.id, result: "No matching lead profile found." });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Lead enrichment error." });
        }
      }

      if (toolCall.function.name === "gemini_ground") {
        try {
          const { query } = toolCall.function.arguments || {};
          if (!query || typeof query !== "string") {
            results.push({
              toolCallId: toolCall.id,
              result: "Missing search query.",
            });
          } else {
            const { groundedSearch } = await import("../lib/gemini-brain");
            const grounded = await groundedSearch(query);
            const sourceTail =
              grounded.sources.length > 0
                ? ` (sources: ${grounded.sources
                    .slice(0, 3)
                    .map((s) => s.title || s.uri || "")
                    .filter(Boolean)
                    .join("; ")})`
                : "";
            results.push({
              toolCallId: toolCall.id,
              result: grounded.answer + sourceTail,
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Grounded search error." });
        }
      }

      // CRM Handlers
      if (toolCall.function.name === "crm_search_contacts") {
        try {
          const { query } = toolCall.function.arguments;
          const service = new CRMService(agent.user_id);
          const { contacts } = await service.searchContacts(query);
          results.push({
            toolCallId: toolCall.id,
            result:
              contacts && contacts.length > 0
                ? `Found CRM contacts: ${JSON.stringify(contacts)}`
                : "No contacts found or CRM not connected.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "CRM search error." });
        }
      }

      if (toolCall.function.name === "crm_log_call") {
        try {
          const { contact_id, subject, notes } = toolCall.function.arguments;
          const service = new CRMService(agent.user_id);
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const success = await service.logCall({
            crmType: "auto",
            subject,
            description: notes || "Call logged automatically by agent.",
            to_number: fallbackNumber || "",
            contact_id,
          });
          results.push({
            toolCallId: toolCall.id,
            result: success ? "Call logged to CRM successfully." : "Failed to log call to CRM.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "CRM logging error." });
        }
      }

      if (toolCall.function.name === "crm_create_opportunity") {
        try {
          const { name, contact_id, stage, amount } = toolCall.function.arguments;
          const service = new CRMService(agent.user_id);
          const success = await service.createOpportunity({
            crmType: "auto",
            name,
            contact_id,
            stage,
            amount: amount ? Number(amount) : undefined,
          });
          results.push({
            toolCallId: toolCall.id,
            result: success
              ? "Opportunity created successfully in CRM."
              : "Failed to create opportunity.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "CRM opportunity error." });
        }
      }

      // Notification Handlers
      if (toolCall.function.name === "send_slack_notification") {
        try {
          const { message: slackMsg } = toolCall.function.arguments;
          if (agent?.user_id) {
            const slackCh = await getDefaultChannel(agent.user_id);
            if (slackCh) {
              await slackPostMessage(
                agent.user_id,
                slackCh,
                `🤖 *Agent Notification*\n${slackMsg}`,
              );
              results.push({
                toolCallId: toolCall.id,
                result: "Slack notification sent successfully.",
              });
            } else {
              results.push({
                toolCallId: toolCall.id,
                result: "Slack integration not configured.",
              });
            }
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Slack notification error." });
        }
      }

      // Workflow Handlers
      if (toolCall.function.name === "generate_zoom_link") {
        try {
          const { topic, start_time, duration } = toolCall.function.arguments;
          const zoomMeeting = await createZoomMeeting(agent.user_id, {
            topic,
            startTime: start_time,
            duration: duration ? Number(duration) : undefined,
          });
          results.push({
            toolCallId: toolCall.id,
            result: zoomMeeting
              ? `Zoom meeting created: ${zoomMeeting.join_url}`
              : "Failed to create Zoom meeting.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Zoom error." });
        }
      }

      if (toolCall.function.name === "log_payment_promise") {
        try {
          const { amount_promised, payment_date, payment_method } = toolCall.function.arguments;
          await drizzle.insert(schema.auditLog).values({
            userId: agent.user_id,
            action: "payment_promise",
            metadata: { amount_promised, payment_date, payment_method },
          });
          results.push({
            toolCallId: toolCall.id,
            result: "Payment promise legally recorded in compliance ledger.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to record payment promise." });
        }
      }

      if (toolCall.function.name === "create_support_ticket") {
        try {
          const { issue_summary, error_codes, severity } = toolCall.function.arguments;
          const [task] = await drizzle
            .insert(schema.fleetTasks)
            .values({
              userId: agent?.user_id,
              agentId: webhookAgentId,
              taskType: "ticket",
              description: `[${severity.toUpperCase()}] ${issue_summary} (Codes: ${error_codes || "None"})`,
              priority: severity === "critical" ? "high" : severity === "high" ? "high" : "medium",
              status: "pending",
              sourceType: "phone_call",
              targetChannel: "manual",
            })
            .returning({ id: schema.fleetTasks.id });
          results.push({
            toolCallId: toolCall.id,
            result: `Support ticket #${task.id.split("-")[0]} created.`,
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to create support ticket." });
        }
      }

      if (toolCall.function.name === "leave_voicemail") {
        results.push({
          toolCallId: toolCall.id,
          result: "Voicemail recorded. Please say goodbye and end the call now.",
        });
      }

      if (toolCall.function.name === "schedule_callback") {
        try {
          const { callback_datetime, notes } = toolCall.function.arguments;
          await drizzle.insert(schema.fleetTasks).values({
            userId: agent?.user_id,
            agentId: webhookAgentId,
            taskType: "callback",
            description: `Scheduled Callback: ${notes}`,
            priority: "high",
            status: "pending",
            sourceType: "phone_call",
            targetChannel: "manual",
            createdAt: new Date(),
          });
          results.push({
            toolCallId: toolCall.id,
            result: `Callback securely scheduled for ${callback_datetime}.`,
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to schedule callback." });
        }
      }

      if (toolCall.function.name === "capture_customer_profile") {
        try {
          await drizzle.insert(schema.fleetTasks).values({
            userId: agent?.user_id,
            agentId: webhookAgentId,
            taskType: "customer_profile_captured",
            description: JSON.stringify(toolCall.function.arguments),
            priority: "medium",
            status: "completed",
            sourceType: "phone_call",
            targetChannel: "manual",
            createdAt: new Date(),
          });
          results.push({
            toolCallId: toolCall.id,
            result: "Customer profile structured and saved.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to capture profile." });
        }
      }

      if (toolCall.function.name === "escalate_to_human") {
        try {
          const { reason } = toolCall.function.arguments;
          if (agent?.user_id) {
            const notifier = new NotificationService(agent.user_id);
            await notifier.sendUrgentAlert({
              title: "Agent Escalate to Human",
              message: `Reason: ${reason}`,
              callId: (payload.call as any)?.id || "unknown",
            });
          }
          results.push({
            toolCallId: toolCall.id,
            result:
              "Escalation signal sent to human supervisors. If you can transfer the call, do it now, otherwise apologize and say a human will call back.",
          });
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to send escalation signal." });
        }
      }

      if (toolCall.function.name === "view_recent_interactions") {
        try {
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          if (fallbackNumber && agent?.user_id) {
            const safePhone = sanitizePhone(fallbackNumber);
            const pastCalls = await drizzle
              .select({
                summary: schema.callLogs.summary,
                intentLabel: schema.callLogs.intentLabel,
                sentiment: schema.callLogs.sentiment,
                createdAt: schema.callLogs.createdAt,
              })
              .from(schema.callLogs)
              .where(
                and(
                  eq(schema.callLogs.customerNumber, safePhone),
                  eq(schema.callLogs.userId, agent.user_id),
                ),
              )
              .orderBy(sql`${schema.callLogs.createdAt} DESC`)
              .limit(3);
            if (pastCalls.length > 0) {
              const summaries = pastCalls
                .map((c) => `- ${c.createdAt?.toISOString()}: [${c.intentLabel}] ${c.summary}`)
                .join("\\n");
              results.push({
                toolCallId: toolCall.id,
                result: `Past 3 interactions:\n${summaries}`,
              });
            } else {
              results.push({
                toolCallId: toolCall.id,
                result: "No recent interactions found for this caller.",
              });
            }
          } else {
            results.push({ toolCallId: toolCall.id, result: "Could not identify caller number." });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Failed to load recent interactions." });
        }
      }

      // ──────────────────────────────────────────────────────────────
      //  Shopify e-commerce handlers — order/inventory/customer
      //  lookups + return/cancel/address actions for online stores.
      //  Each calls the matching shopify-service function; the service
      //  returns a graceful no-op when no Shopify store is connected,
      //  so these never throw on an un-connected tenant.
      // ──────────────────────────────────────────────────────────────
      if (toolCall.function.name === "shopify_lookup_order") {
        try {
          const { order_number, email } = toolCall.function.arguments || {};
          const order = await shopifyLookupOrder({
            orderNumber: order_number,
            email,
            userId: agent?.user_id,
          });
          if (!order) {
            results.push({
              toolCallId: toolCall.id,
              result:
                "I couldn't find an order matching that. Double-check the order number or the email on the order.",
            });
          } else {
            const trackingLine =
              order.tracking.length > 0 && order.tracking[0].number
                ? ` Tracking: ${order.tracking[0].company || "carrier"} ${order.tracking[0].number}.`
                : " No tracking number yet.";
            const itemList = order.line_items.map((li) => `${li.quantity}x ${li.title}`).join(", ");
            results.push({
              toolCallId: toolCall.id,
              result: `Order ${order.name}: ${order.fulfillment_status}, payment ${order.financial_status}, total ${order.total} ${order.currency}.${trackingLine} Items: ${itemList}. [data: ${JSON.stringify(order)}]`,
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Order lookup error." });
        }
      }

      if (toolCall.function.name === "shopify_check_inventory") {
        try {
          const { query } = toolCall.function.arguments || {};
          const products = await shopifySearchProducts({
            query: String(query || ""),
            userId: agent?.user_id,
          });
          if (products.length === 0) {
            results.push({
              toolCallId: toolCall.id,
              result: "I couldn't find a product matching that in the store catalog.",
            });
          } else {
            const summary = products
              .slice(0, 5)
              .map((p) => {
                const v = p.variants
                  .map(
                    (vr) =>
                      `${vr.title} — $${vr.price}, ${vr.inventory_quantity > 0 ? `${vr.inventory_quantity} in stock` : "out of stock"}`,
                  )
                  .join("; ");
                return `${p.title}: ${v}`;
              })
              .join(" | ");
            results.push({
              toolCallId: toolCall.id,
              result: `Found ${products.length} product(s). ${summary} [data: ${JSON.stringify(products)}]`,
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Inventory check error." });
        }
      }

      if (toolCall.function.name === "shopify_lookup_customer") {
        try {
          const { email, phone } = toolCall.function.arguments || {};
          const fallbackNumber =
            (payload.call as { customer?: { number?: string } } | undefined)?.customer?.number ||
            (message.call as { customer?: { number?: string } } | undefined)?.customer?.number;
          const customer = await shopifyLookupCustomer({
            email,
            phone: phone || fallbackNumber,
            userId: agent?.user_id,
          });
          if (!customer) {
            results.push({
              toolCallId: toolCall.id,
              result: "I couldn't find a customer record matching that email or phone number.",
            });
          } else {
            const recent = customer.recent_orders
              .map((o) => `${o.name} (${o.financial_status}, ${o.total})`)
              .join(", ");
            results.push({
              toolCallId: toolCall.id,
              result: `Customer ${customer.first_name} ${customer.last_name}: ${customer.orders_count} order(s), ${customer.total_spent} lifetime. Recent: ${recent || "none"}. [data: ${JSON.stringify(customer)}]`,
            });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Customer lookup error." });
        }
      }

      if (toolCall.function.name === "shopify_start_return") {
        try {
          const { order_id, reason } = toolCall.function.arguments || {};
          if (!order_id) {
            results.push({
              toolCallId: toolCall.id,
              result: "I need the order ID to start a return. Look up the order first.",
            });
          } else {
            const outcome = await shopifyStartReturn({
              orderId: String(order_id),
              reason: String(reason || "customer request"),
              userId: agent?.user_id,
            });
            results.push({ toolCallId: toolCall.id, result: outcome.message });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Return request error." });
        }
      }

      if (toolCall.function.name === "shopify_cancel_order") {
        try {
          const { order_id } = toolCall.function.arguments || {};
          if (!order_id) {
            results.push({
              toolCallId: toolCall.id,
              result: "I need the order ID to cancel an order. Look up the order first.",
            });
          } else {
            const outcome = await shopifyCancelOrder({
              orderId: String(order_id),
              userId: agent?.user_id,
            });
            results.push({ toolCallId: toolCall.id, result: outcome.message });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Order cancel error." });
        }
      }

      if (toolCall.function.name === "shopify_update_address") {
        try {
          const args = toolCall.function.arguments || {};
          if (!args.order_id) {
            results.push({
              toolCallId: toolCall.id,
              result: "I need the order ID to update the shipping address.",
            });
          } else {
            const outcome = await shopifyUpdateAddress({
              orderId: String(args.order_id),
              address: {
                address1: args.address1,
                address2: args.address2,
                city: args.city,
                province: args.province,
                zip: args.zip,
                country: args.country,
                name: args.name,
              },
              userId: agent?.user_id,
            });
            results.push({ toolCallId: toolCall.id, result: outcome.message });
          }
        } catch {
          results.push({ toolCallId: toolCall.id, result: "Address update error." });
        }
      }
    }
    return res.json({ results });
  }

  if (message && message.type === "status-update") {
    const callId = (payload.call as { id?: string } | undefined)?.id;
    const status =
      (message as { status?: string }).status ||
      (payload.call as { status?: string } | undefined)?.status;
    const customerNumber = (payload.call as { customer?: { number?: string } } | undefined)
      ?.customer?.number;
    if (callId) {
      if (["in-progress", "ringing", "queued"].includes(status)) {
        await drizzle
          .insert(schema.signalPresence)
          .values({
            id: callId,
            userId: agent?.user_id,
            agentId: webhookAgentId,
            customerNumber: customerNumber || "Unknown",
            status: status,
            startedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.signalPresence.id,
            set: { status, startedAt: new Date() },
          });

        // Update lead status to "Connected" when call is in-progress
        if (status === "in-progress" && customerNumber && agent?.user_id) {
          await drizzle
            .update(schema.outboundLeads)
            .set({ status: "Connected", callId })
            .where(
              and(
                eq(schema.outboundLeads.customerNumber, customerNumber),
                eq(schema.outboundLeads.userId, agent.user_id),
                eq(schema.outboundLeads.status, "Dialing"),
              ),
            )
            .catch((e) =>
              log.warn("Failed to update lead status to Connected", { error: getErrorMessage(e) }),
            );
        }

        if (customerNumber && agent?.user_id) {
          await enqueue(drizzle, {
            userId: agent.user_id,
            type: "proactive_lead_enrichment",
            payload: { userId: agent.user_id, customerNumber },
          }).catch((e) => log.warn("Enrichment queue failed", { error: getErrorMessage(e) }));
        }
      } else if (status === "ended" || status === "completed") {
        await drizzle.delete(schema.signalPresence).where(eq(schema.signalPresence.id, callId));
      }
    }
  }

  if (message && message.type === "conversation-update") {
    const callId =
      (payload.call as { id?: string } | undefined)?.id ||
      (message.call as { id?: string } | undefined)?.id;
    if (callId) {
      const turns: any[] = message.conversation || message.messages || [];
      const userTurns = turns
        .filter((t: { role: string; content?: string; message?: string }) => t.role === "user")
        .slice(-2);
      const combined = userTurns
        .map((t: { content?: string; message?: string }) =>
          (t.content || t.message || "").toLowerCase(),
        )
        .join(" ");

      const negativeHits = SENTIMENT_ANGRY_SIGNALS.filter((w) => combined.includes(w)).length;
      const positiveHits = SENTIMENT_POSITIVE_SIGNALS.filter((w) => combined.includes(w)).length;

      let liveSentimentLabel = "Live · Active";
      if (negativeHits >= 2) liveSentimentLabel = "⚠ Frustrated";
      else if (positiveHits >= 2) liveSentimentLabel = "✓ Positive";

      // Circuit Breaker: Deep analysis if frustration is detected.
      if (negativeHits >= 1) {
        analyzeLiveSentiment(combined)
          .then(async (result) => {
            if (result.escalate) {
              await drizzle
                .update(schema.signalPresence)
                .set({
                  label: `🚨 Escalation Risk: ${result.reason}`,
                })
                .where(eq(schema.signalPresence.id, callId));

              // Circuit Breaker Notification
              const notifier = new NotificationService(agent.user_id);
              await notifier.sendUrgentAlert({
                title: "High Escalation Risk Detected",
                message: `Live monitoring detected a high-stress situation: ${result.reason}`,
                callId: callId,
                metadata: { urgency: result.urgency },
              });

              log.warn("Circuit Breaker Tripped", {
                callId,
                reason: result.reason,
                urgency: result.urgency,
              });
            }
          })
          .catch((e) => log.error("Circuit breaker analysis failed", { error: e.message }));
      }

      await drizzle
        .update(schema.signalPresence)
        .set({ label: liveSentimentLabel })
        .where(eq(schema.signalPresence.id, callId));
    }
  }

  // Mid-call voice swap on detected non-English language. Vapi's
  // transcriber emits a dedicated `language-change-detected` event the
  // moment a caller switches to e.g. Spanish. We look up the operator's
  // configured secondary voice for this agent and hand the call off to
  // a clone of the assistant running that voice — caller hears "Sarah"
  // (English) → ~500ms of dead air → "Maria" (Spanish), no hold music.
  //
  // Why a handoff and not a config patch: Vapi's PATCH /call/{id}
  // endpoint only mutates the call display name (May 2026 docs); the
  // voice block on the running assistant is immutable mid-call. The
  // live-call control channel exposes a `handoff` message type that
  // DOES accept a fresh voice override — that's the path we use.
  //
  // Pattern source: ElevenLabs multi-voice cookbook —
  //   https://elevenlabs.io/docs/eleven-agents/customization/voice/multi-voice-support
  //
  // Trade-offs documented in src/lib/vapi-voice-swap.ts:1-30.
  if (message && message.type === "language-change-detected") {
    const langCode = (message as { language?: string }).language || "";
    const callObj = (payload.call as Record<string, any> | undefined) || {};
    const callId = (callObj.id as string | undefined) || "";

    // English back to English is a no-op (the transcriber sometimes
    // flickers when the caller code-switches mid-sentence). We only
    // swap on a NON-English detected language.
    if (callId && langCode && langCode !== "en") {
      // Dedupe — Vapi re-emits the same language-change event on
      // noisy transcripts; a second handoff would re-fire the same
      // ~500ms dead-air gap for nothing.
      if (shouldSwapForCall(callId, langCode)) {
        try {
          const [agentRow] = await drizzle
            .select({
              secondaryVoiceId: schema.agents.secondaryVoiceId,
              voiceProvider: schema.agents.voiceProvider,
            })
            .from(schema.agents)
            .where(eq(schema.agents.id, webhookAgentId))
            .limit(1);

          if (agentRow?.secondaryVoiceId) {
            const result = await performMidCallVoiceSwap({
              call: callObj as any,
              detectedLanguage: langCode,
              secondaryVoiceId: agentRow.secondaryVoiceId,
              voiceProvider: agentRow.voiceProvider || "11labs",
            });
            logSwapAttempt(callId, webhookAgentId, langCode, result);
          } else {
            // No secondary voice configured — log so ops can see the
            // operator hasn't set one up yet.
            log.info("Vapi language-change detected but no secondary voice set", {
              callId,
              agentId: webhookAgentId,
              language: langCode,
            });
          }
        } catch (e: any) {
          log.warn("Vapi mid-call voice swap lookup failed", {
            callId,
            agentId: webhookAgentId,
            language: langCode,
            error: getErrorMessage(e),
          });
        }
      }
    }
    return res.json({ received: true });
  }

  if (message && message.type === "end-of-call-report") {
    // Clear the per-call voice-swap dedupe entries — keeps the
    // in-memory dedupe set bounded across thousands of calls.
    const endCallId = (message.call as { id?: string } | undefined)?.id;
    if (endCallId) clearSwapDedupe(endCallId);

    // Queue for async processing to prevent Vapi timeout/retries
    // End-of-call processing can take 10-30s (AI analysis, webhook dispatch)
    try {
      await enqueue(drizzle, {
        userId: agent.user_id,
        type: "vapi_webhook",
        payload: {
          webhookType: "end-of-call-report",
          payload: req.body,
          agentId: webhookAgentId,
          userId: agent.user_id,
          webhookAgentId,
        } as Record<string, unknown>,
      });
      log.info("Queued end-of-call-report for async processing", {
        agentId: webhookAgentId,
        callId: (message.call as { id?: string })?.id,
      });
      return res.json({ success: true, queued: true });
    } catch (e: any) {
      log.error("Failed to queue end-of-call-report", { error: getErrorMessage(e) });
      // Fallback to sync processing if queue fails
      try {
        await handleEndOfCallReport({ message: message as any, agent: agent as any });
        return res.json({ success: true });
      } catch (e2: any) {
        log.error("Failed to process call completion (sync fallback)", {
          error: getErrorMessage(e2),
        });
        return res.json({ success: false });
      }
    }
  }

  return res.json({ received: true });
});

export default router;
