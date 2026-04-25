/**
 * Vapi webhook router. Handles inbound webhooks from the Vapi voice carrier
 * (assistant-request, tool-calls, end-of-call-report). Auth is either:
 *   - a valid Wireline user JWT (so the dashboard can simulate calls), OR
 *   - the configured shared `WIRELINE_WEBHOOK_SECRET` header.
 */
import { Router, type Request, type Response } from "express";

import { getAuthenticatedUser, hasValidWebhookSecret } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/errors";
import { getGeminiClient } from "../lib/gemini";
import { getGoogleOAuthClient, google } from "../lib/google";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";
import { isValidEmailAddress, sanitizeLikeInput } from "../lib/validation";
import { env } from "../lib/env";

const router = Router();

router.post(
  "/api/vapi-webhook",
  asyncHandler(async (req: Request, res: Response) => {
    const authenticatedUser = await getAuthenticatedUser(req);
    if (!authenticatedUser && !hasValidWebhookSecret(req)) {
      throw AppError.unauthorized("Unauthorized webhook request");
    }

    const payload = req.body;
    if (!payload || typeof payload !== "object") {
      throw AppError.badRequest("Invalid webhook payload");
    }

    const { message } = payload;
    if (!message || typeof message !== "object") {
      throw AppError.badRequest("Invalid webhook message");
    }

    logger.debug({ messageType: message.type }, "Incoming Vapi webhook");

    const webhookAgentId = typeof req.query.agentId === "string" ? req.query.agentId.trim() : "";
    if (!webhookAgentId) {
      throw AppError.badRequest("Missing agentId query parameter");
    }

    const { data: agentOwner } = await db
      .from("wireline_agents")
      .select("user_id")
      .eq("id", webhookAgentId)
      .single();
    if (!agentOwner) throw AppError.notFound("Agent not found");
    if (authenticatedUser && agentOwner.user_id !== authenticatedUser.id) {
      throw AppError.forbidden();
    }

    const { data: userSettings } = await db
      .from("wireline_settings")
      .select("subscription_status")
      .eq("user_id", agentOwner.user_id)
      .single();
    const subscriptionStatus = userSettings?.subscription_status || "active";

    if (subscriptionStatus !== "active") {
      logger.info({ webhookAgentId }, "Connection rejected: subscription not active");
      if (message && message.type === "assistant-request") {
        return res.json({
          assistant: {
            firstMessage:
              "We're sorry, but the automated service for this line is currently suspended. Please contact the administrator.",
            model: {
              provider: "google",
              model: "gemini-2.0-flash",
              systemPrompt: "Tell the user the service is suspended, and gracefully end the call.",
            },
          },
        });
      }
      throw AppError.forbidden("Access Denied: Inactive Subscription");
    }

    if (message && message.type === "assistant-request") {
      logger.debug({ webhookAgentId }, "Assistant request received");

      try {
        const [agentConfig, directivesData, knowledgeData, personalityData] = await Promise.all([
          db
            .from("wireline_agents")
            .select("*")
            .eq("id", webhookAgentId)
            .eq("user_id", agentOwner.user_id)
            .single(),
          db
            .from("wireline_directives")
            .select("content, priority")
            .eq("agent_id", webhookAgentId)
            .eq("user_id", agentOwner.user_id)
            .order("priority", { ascending: false }),
          db
            .from("wireline_knowledge")
            .select("content")
            .eq("agent_id", webhookAgentId)
            .eq("user_id", agentOwner.user_id),
          db
            .from("wireline_personality")
            .select("content")
            .eq("agent_id", webhookAgentId)
            .eq("user_id", agentOwner.user_id)
            .single(),
        ]);

        const currentDateTime = new Date().toLocaleString("en-US", {
          timeZone: "America/New_York",
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

        const isOutbound =
          message.type === "outboundPhoneCall" || message.call?.type === "outboundPhoneCall";
        const archetype = isOutbound
          ? "The Closer"
          : agentConfig?.data?.archetype || "Receptionist";

        let archetypeRules = "";
        let llmTemp = 0.4;

        switch (archetype) {
          case "The Closer":
            archetypeRules =
              "You are a high-stakes closer. Use a confident tone. If a lead hesitates, offer a limited-time incentive to book now.";
            llmTemp = 0.7;
            break;
          case "Support Tech":
            archetypeRules =
              "You are highly analytical, patient, and precise. You ask clarifying troubleshooting questions one at a time. You do not rush.";
            llmTemp = 0.2;
            break;
          case "The Empath":
            archetypeRules =
              "If a caller sounds frustrated, your first words must be a validating statement like 'I completely hear you, that's incredibly stressful. Let me fix this for you.'";
            llmTemp = 0.6;
            break;
          default:
            archetypeRules =
              "You are an expert at handling phone calls where people are often in a hurry. Never use platitudes like 'I hope you're having a wonderful day.' Get straight to the value. You are cheerful, polite, and highly efficient.";
            llmTemp = 0.4;
        }

        const ambientNoiseActive =
          agentConfig?.data?.ambient_noise && agentConfig?.data?.ambient_noise !== "off";

        const systemPrompt = `
      ## BLOCK 1: IDENTITY & ARCHETYPE (THE "MOAT")
      Persona: You are ${agentConfig?.data?.name || "Wireline Agent"}, a representative for our company.
      Tone: Snappy, concise, low-friction.
      The "Secret Sauce": ${archetypeRules}
      Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
      ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}

      ${agentConfig?.data?.website_url ? `## KNOWLEDGE GROUNDING\nYour company's official website is: ${agentConfig.data.website_url}. If asked for more details or deep info not in your knowledge base, refer them back to the site.` : ""}

      ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
      You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them (e.g., "So that would be Tuesday the 24th at 2pm?").

      ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
      Response Length: Keep every response under 20 words unless you are explaining a complex process. Long AI monologues feel like robots.
      The "Anti-Echo" Rule: Do not repeat back what the user just said. If they say "My heater is broken", do not say "I understand your heater is broken." Instead, say "Got it. Let's get a tech out there. Is it blowing cold air or not turning on at all?"
      Question Limit: Never ask more than one question at a time.
      Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

      ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
      Sequence Requirements:
      1. If a user wants a slot, you MUST check calendar availability first.
      2. If the slot is open, book the appointment.
      3. Confirm the Reference ID provided by the system before hanging up.

      Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

      # CROSS-CHANNEL HANDOFF (OMNICHANNEL)
      If a customer needs a detailed follow-up, a reminder, or a document sent that you cannot speak entirely over the phone, use the 'send_email' tool.
      Tell the caller: "I'll hand this over to our email team to send you that info right now."

      ## ABSOLUTE RULES
      ${(directivesData?.data || []).map((d: { priority: number; content: string }) => `[PRIORITY ${d.priority}] ${d.content}`).join("\n")}

      ## KNOWLEDGE BASE
      ${(knowledgeData?.data || []).map((k: { content: string }) => `- ${k.content}`).join("\n")}
      `;

        const responsePayload = {
          assistant: {
            name: agentConfig?.data?.name || "Wireline Agent",
            firstMessage:
              agentConfig?.data?.first_message ||
              "Hello! Thank you for calling. How can I help you today?",
            serverUrlSecret: env.WIRELINE_WEBHOOK_SECRET?.trim(),
            serverMessages: [
              "tool-calls",
              "status-update",
              "conversation-update",
              "end-of-call-report",
            ],
            backgroundSound: agentConfig?.data?.ambient_noise || "off",
            model: {
              provider: "google",
              model: "gemini-2.0-flash",
              systemPrompt: systemPrompt,
              temperature: llmTemp,
            },
            recordingEnabled: true,
            voice: {
              provider: isOutbound
                ? agentConfig?.data?.voice_provider_outbound ||
                  agentConfig?.data?.voice_provider ||
                  "11labs"
                : agentConfig?.data?.voice_provider_inbound ||
                  agentConfig?.data?.voice_provider ||
                  "11labs",
              voiceId: isOutbound
                ? agentConfig?.data?.voice_id_outbound ||
                  agentConfig?.data?.voice_id ||
                  "bIHbv24MWmeRgasZH58o"
                : agentConfig?.data?.voice_id_inbound ||
                  agentConfig?.data?.voice_id ||
                  "bIHbv24MWmeRgasZH58o",
            },
            functions: [
              {
                name: "check_calendar_availability",
                description:
                  "Checks the database calendar to see what times are already booked on a specific date. ALWAYS run this before confirming an appointment to prevent double-booking.",
                parameters: {
                  type: "object",
                  properties: {
                    date: {
                      type: "string",
                      description: "The date to check (e.g., 'October 15', 'Next Tuesday').",
                    },
                  },
                  required: ["date"],
                },
              },
              {
                name: "book_appointment",
                description:
                  "Books a home service appointment. Use this only AFTER checking the calendar to ensure the time is free.",
                parameters: {
                  type: "object",
                  properties: {
                    date: {
                      type: "string",
                      description: "The date of the appointment (e.g., 'Tuesday', 'Oct 15')",
                    },
                    time: {
                      type: "string",
                      description: "The time of the appointment (e.g., '2 PM')",
                    },
                    customer_name: { type: "string", description: "The caller's name" },
                    service_type: {
                      type: "string",
                      description: "The type of service requested (e.g., 'AC Repair', 'Plumbing')",
                    },
                  },
                  required: ["date", "time", "customer_name", "service_type"],
                },
              },
              {
                name: "escalate_to_human",
                description:
                  "Transfers the call to a real human manager. Use this if the customer is very angry, asks for a human repeatedly, or has an extremely complex question you cannot answer with your Knowledge Base.",
                parameters: { type: "object", properties: {}, required: [] },
              },
              {
                name: "send_email",
                description:
                  "Sends an email to the customer. Use this to send confirmations, quotes, or follow-up information during or after the call.",
                parameters: {
                  type: "object",
                  properties: {
                    to_email: {
                      type: "string",
                      description: "The customer's email address.",
                    },
                    subject: { type: "string", description: "The subject of the email." },
                    body: { type: "string", description: "The body content of the email." },
                  },
                  required: ["to_email", "subject", "body"],
                },
              },
            ],
          },
        };

        return res.json(responsePayload);
      } catch (e) {
        logger.error({ err: e }, "Vapi webhook config error");
        // Give Vapi a graceful fallback so it doesn't freeze
        return res.json({
          assistant: {
            firstMessage: "I'm sorry, my memory banks are currently offline.",
            model: {
              provider: "google",
              model: "gemini-2.0-flash",
              systemPrompt: "Apologize and hang up.",
            },
          },
        });
      }
    }

    if (message && message.type === "tool-calls") {
      if (!Array.isArray(message.toolCalls)) {
        throw AppError.badRequest("Invalid tool call payload");
      }

      const { data: agent } = await db
        .from("wireline_agents")
        .select("*")
        .eq("id", webhookAgentId)
        .eq("user_id", agentOwner.user_id)
        .single();

      const results: Array<{ toolCallId: string; result: string }> = [];

      for (const toolCall of message.toolCalls) {
        if (toolCall.function.name === "check_calendar_availability") {
          try {
            const { date } = toolCall.function.arguments;
            if (typeof date !== "string" || !date.trim()) {
              throw new Error("Invalid date");
            }
            const sanitizedDate = sanitizeLikeInput(date);
            const { data, error } = await db
              .from("wireline_appointments")
              .select("time, service_type")
              .eq("agent_id", webhookAgentId)
              .eq("user_id", agent.user_id)
              .ilike("date", `%${sanitizedDate}%`);

            if (error) throw error;

            if (data && data.length > 0) {
              const bookedTimes = data.map((appt) => appt.time).join(", ");
              results.push({
                toolCallId: toolCall.id,
                result: `The following times are already booked on ${date}: ${bookedTimes}. Please tell the customer these times are unavailable and offer them any other time.`,
              });
            } else {
              results.push({
                toolCallId: toolCall.id,
                result: `The entire day on ${date} is completely open. You can offer them any time during normal business hours.`,
              });
            }
          } catch {
            results.push({
              toolCallId: toolCall.id,
              result: "Cannot access calendar. Assume open for now but warn customer it is pending.",
            });
          }
        }

        if (toolCall.function.name === "book_appointment") {
          try {
            const args = toolCall.function.arguments;

            const { data, error } = await db
              .from("wireline_appointments")
              .insert({
                user_id: agent.user_id,
                agent_id: webhookAgentId,
                call_id: message.call?.id || "in-call",
                date: args.date || "Unknown Date",
                time: args.time || "Unknown Time",
                customer_name: args.customer_name || "Guest",
                service_type: args.service_type || "General Service",
                status: "Scheduled",
              })
              .select("id")
              .single();

            if (error) throw error;

            results.push({
              toolCallId: toolCall.id,
              result: `Appointment confirmed successfully! Your booking reference ID is ${data.id.split("-")[0]}.`,
            });
          } catch (e) {
            logger.error({ err: e }, "Failed to book appointment");
            results.push({
              toolCallId: toolCall.id,
              result: "I'm sorry, I'm having trouble accessing the calendar database right now.",
            });
          }
        }

        if (toolCall.function.name === "escalate_to_human") {
          const dest = agent?.transfer_phone || "the front office";
          results.push({
            toolCallId: toolCall.id,
            result: `Please say: 'I am transferring you to ${dest} now, please hold on.' Then, simulate the hold process.`,
          });
        }

        if (toolCall.function.name === "send_email") {
          try {
            const { to_email, subject, body } = toolCall.function.arguments;
            if (
              !isValidEmailAddress(to_email) ||
              typeof subject !== "string" ||
              typeof body !== "string"
            ) {
              throw new Error("Invalid email handoff payload");
            }

            const { data: accounts } = await db
              .from("wireline_email_accounts")
              .select("*")
              .eq("user_id", agent.user_id)
              .limit(1);

            if (!accounts || accounts.length === 0) {
              results.push({
                toolCallId: toolCall.id,
                result: "Email system is not connected to any inbox. Inform the customer.",
              });
              continue;
            }

            const account = accounts[0];
            const curAgentId = webhookAgentId || "default-agent";

            const { data: task, error: taskError } = await db
              .from("wireline_fleet_tasks")
              .insert({
                user_id: agent.user_id,
                source_type: "phone_call",
                source_id: message.call?.id || "manual-handoff",
                target_channel: "email",
                agent_id: curAgentId,
                customer_info: { email: to_email },
                task_type: "follow_up",
                description: `Subject: ${subject}\n\n${body}`,
                status: "processing",
              })
              .select("*")
              .single();

            if (taskError) throw taskError;

            const oauth2Client = getGoogleOAuthClient(req);
            oauth2Client.setCredentials({
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expiry_date: account.expires_at,
            });

            const gmail = google.gmail({ version: "v1", auth: oauth2Client });
            const messageParts = [
              `To: ${to_email}`,
              `Subject: ${subject}`,
              "Content-Type: text/plain; charset=utf-8",
              "",
              body,
            ];
            const encodedMessage = Buffer.from(messageParts.join("\n"))
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, "");

            const gmailRes = await gmail.users.messages.send({
              userId: "me",
              requestBody: { raw: encodedMessage },
            });

            try {
              const googleThreadId = gmailRes.data.threadId;
              let { data: thread } = await db
                .from("wireline_email_threads")
                .select("*")
                .eq("thread_id", googleThreadId)
                .single();

              if (!thread) {
                const { data: newThread } = await db
                  .from("wireline_email_threads")
                  .insert({
                    user_id: agent.user_id,
                    account_id: account.id,
                    thread_id: googleThreadId,
                    customer_email: to_email,
                    subject: subject,
                    status: "open",
                    summary: `Phone Follow-up: ${to_email}`,
                  })
                  .select("*")
                  .single();
                thread = newThread;
              }

              await db.from("wireline_email_messages").insert({
                user_id: agent.user_id,
                thread_id: thread.id,
                google_message_id: gmailRes.data.id,
                role: "ai",
                content: body,
              });

              await db
                .from("wireline_email_threads")
                .update({ last_message_at: new Date() })
                .eq("id", thread.id);
            } catch (syncErr) {
              logger.error({ err: syncErr }, "Omnichannel sync error");
            }

            await db
              .from("wireline_fleet_tasks")
              .update({ status: "completed" })
              .eq("id", task.id)
              .eq("user_id", agent.user_id);

            results.push({
              toolCallId: toolCall.id,
              result: `Successfully handed off follow-up task to the AI Email Fleet. Task ID: ${task.id.split("-")[0]}. The email has been dispatched via your connected mailroom.`,
            });
          } catch (e) {
            logger.error({ err: e }, "Fleet Handoff Failed");
            results.push({
              toolCallId: toolCall.id,
              result: "Handoff to email system failed. Please take a manual note.",
            });
          }
        }
      }

      res.json({ results });
      return;
    }

    if (message && message.type === "end-of-call-report") {
      logger.debug("Call ended, report received");

      try {
        const call = message.call;
        const analysis = message.analysis;

        let duration = 0;
        if (call?.endedAt && call?.startedAt) {
          duration = Math.floor(
            (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
          );
        }

        await db.from("wireline_call_logs").insert({
          user_id: agentOwner.user_id,
          vapi_call_id: call?.id || "unknown",
          agent_id: webhookAgentId,
          direction: call?.type === "outboundPhoneCall" ? "outbound" : "inbound",
          customer_number: call?.customer?.number || "",
          duration_seconds: duration,
          cost: call?.cost || 0.0,
          summary: analysis?.summary || "No summary provided.",
          transcript: message.transcript || "",
          recording_url: message.recordingUrl || message.stereoRecordingUrl || null,
        });

        const scoringPrompt = `
          Analyze this call TRANSCRIPT and give a BUYING INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
          Transcript: ${message.transcript || "None"}
          Summary: ${analysis?.summary || ""}
          RESPONSE FORMAT (JSON): { "score": number, "label": string }
        `;
        try {
          const scoreRes = await getGeminiClient().models.generateContent({
            model: "gemini-2.0-flash",
            contents: scoringPrompt,
            config: { responseMimeType: "application/json" },
          });
          const scoreObj = JSON.parse(scoreRes.text || "{}");
          await db
            .from("wireline_call_logs")
            .update({
              lead_score: scoreObj.score || 0,
              intent_label: scoreObj.label || "none",
            })
            .eq("vapi_call_id", call?.id)
            .eq("user_id", agentOwner.user_id);
        } catch (scoringErr) {
          logger.error({ err: scoringErr }, "Call scoring failed");
        }

        if (call?.type === "outboundPhoneCall") {
          await db
            .from("wireline_outbound_leads")
            .update({ status: "Completed" })
            .eq("call_id", call?.id)
            .eq("user_id", agentOwner.user_id);
        }

        return res.json({ success: true });
      } catch (e) {
        logger.error({ err: e }, "Failed to save call log");
        return res.json({ success: false });
      }
    }

    res.json({ status: "ok" });
  })
);

export default router;
