import { Router, type Response } from "express";
import { z } from "zod";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { AppError, asyncHandler } from "../lib/errors";
import { getGeminiClient } from "../lib/gemini";
import { getGoogleOAuthClient, google } from "../lib/google";
import { logger } from "../lib/logger";
import { RATE_LIMITS, rateLimit } from "../lib/rateLimit";
import { db } from "../lib/supabase";
import { validate } from "../lib/validation";

const router = Router();

const updateAccountMappingSchema = z
  .object({
    agent_id: z.string().trim().min(1).max(200).nullish(),
  })
  .strict();

const replySchema = z
  .object({
    body: z.string().trim().min(1).max(50_000),
  })
  .strict();

router.get(
  "/api/emails/accounts",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: accounts, error } = await db
        .from("wireline_email_accounts")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ accounts: accounts || [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  })
);

router.patch(
  "/api/emails/accounts/:id",
  authenticateUser,
  validate(updateAccountMappingSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_id } = req.body;
      await db
        .from("wireline_email_accounts")
        .update({ agent_id })
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to update account mapping" });
    }
  })
);

router.delete(
  "/api/emails/accounts/:id",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db
        .from("wireline_email_accounts")
        .delete()
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to disconnect account" });
    }
  })
);

router.get(
  "/api/emails/threads",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: threads, error } = await db
        .from("wireline_email_threads")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      res.json({ threads: threads || [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch threads" });
    }
  })
);

router.get(
  "/api/emails/threads/:id/messages",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data: messages, error } = await db
        .from("wireline_email_messages")
        .select("*")
        .eq("thread_id", req.params.id)
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      res.json({ messages: messages || [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  })
);

router.post(
  "/api/emails/sync",
  rateLimit(RATE_LIMITS.ai),
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.id;
      const { data: accounts } = await db
        .from("wireline_email_accounts")
        .select("*")
        .eq("user_id", userId);
      if (!accounts || accounts.length === 0) return res.json({ success: true, count: 0 });

      const { data: agent } = await db
        .from("wireline_agents")
        .select("*")
        .eq("user_id", userId)
        .limit(1)
        .single();

      let totalNew = 0;

      for (const account of accounts) {
        let activeAgent = agent;
        if (account.agent_id) {
          const { data: specificAgent } = await db
            .from("wireline_agents")
            .select("*")
            .eq("id", account.agent_id)
            .single();
          if (specificAgent) activeAgent = specificAgent;
        }

        const oauth2Client = getGoogleOAuthClient(req);
        oauth2Client.setCredentials({
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expiry_date: account.expires_at,
        });

        const gmail = google.gmail({ version: "v1", auth: oauth2Client });

        const gmailRes = await gmail.users.messages.list({
          userId: "me",
          q: "is:unread",
          maxResults: 5,
        });

        const messages = gmailRes.data.messages || [];

        for (const msg of messages) {
          const msgData = await gmail.users.messages.get({ userId: "me", id: msg.id! });
          const headers = msgData.data.payload?.headers || [];
          const subject = headers.find((h) => h.name === "Subject")?.value || "No Subject";
          const from = headers.find((h) => h.name === "From")?.value || "";
          const threadId = msgData.data.threadId!;

          const snippet = msgData.data.snippet || "";

          let { data: existingThread } = await db
            .from("wireline_email_threads")
            .select("*")
            .eq("thread_id", threadId)
            .eq("user_id", userId)
            .single();

          if (!existingThread) {
            const { data: newThread } = await db
              .from("wireline_email_threads")
              .insert({
                user_id: userId,
                account_id: account.id,
                thread_id: threadId,
                customer_email: from,
                subject: subject,
                status: "pending_ai",
              })
              .select("*")
              .single();
            existingThread = newThread;
          }

          const { data: existingMsg } = await db
            .from("wireline_email_messages")
            .select("*")
            .eq("google_message_id", msg.id!)
            .eq("user_id", userId)
            .single();
          if (existingMsg) continue;

          totalNew++;

          await db.from("wireline_email_messages").insert({
            user_id: userId,
            thread_id: existingThread!.id,
            google_message_id: msg.id!,
            role: "customer",
            content: snippet,
          });

          await gmail.users.messages.modify({
            userId: "me",
            id: msg.id!,
            requestBody: { removeLabelIds: ["UNREAD"] },
          });

          const prompt = `
             ## BLOCK 1: IDENTITY & ARCHETYPE
             Persona: You are the AI Email Agent for our company.
             Tone: ${activeAgent?.email_agent_tone || "Professional"}. Concise and helpful.
             Personality: ${activeAgent?.archetype || "Receptionist"}.
             Company Site: ${activeAgent?.website_url || "Home Services Platform"}.
             Signature: ${activeAgent?.email_signature || "The Wireline Team"}.

             ## BLOCK 2: CONTEXT
             INCOMING EMAIL FROM: ${from}
             SUBJECT: ${subject}
             CONTENT: ${snippet}

             ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
             Response Length: Keep it professional and concise. Do not write a novel.
             Goal: Write a Sales or Customer Service response.
             - If they are asking for a callback, acknowledge and tell them a representative will call them soon.
             - If they want an appointment, provide basic info and ask them to call or utilize the website.
             - Do not repeat their entire message back to them. Get straight to the value.

             ## KNOWLEDGE BASE
             ${activeAgent?.knowledge ? activeAgent.knowledge.map((k: { content: string }) => `- ${k.content}`).join("\n") : "Rely on standard professional knowledge."}

             RESPONSE:
           `;

          const aiRes = await getGeminiClient().models.generateContent({
            model: "gemini-2.0-flash",
            contents: prompt,
          });
          const aiText = aiRes.text || "I've received your email and will follow up shortly.";
          const finalReply = activeAgent?.email_signature
            ? `${aiText}\n\n${activeAgent.email_signature}`
            : aiText;

          await db.from("wireline_email_messages").insert({
            user_id: userId,
            thread_id: existingThread!.id,
            role: "ai",
            content: finalReply,
          });

          if (activeAgent?.email_auto_respond) {
            try {
              const toEmail = from.includes("<") ? from.split("<")[1].split(">")[0] : from;
              const raw = Buffer.from(
                `To: ${toEmail}\r\n` +
                  `Subject: Re: ${subject}\r\n` +
                  `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
                  `${finalReply}`
              )
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                // Bounded `={0,2}` instead of `=+`: base64 padding is at most
                // two `=` characters, so this avoids a CodeQL polynomial-redos
                // flag.
                .replace(/={0,2}$/, "");

              await gmail.users.messages.send({
                userId: "me",
                requestBody: { raw, threadId },
              });
            } catch (sendErr) {
              logger.error({ err: sendErr }, "Auto-respond failed");
            }
          }

          const lowerSnippet = snippet.toLowerCase();
          if (
            lowerSnippet.includes("call") ||
            lowerSnippet.includes("phone") ||
            lowerSnippet.includes("callback") ||
            lowerSnippet.includes("number")
          ) {
            try {
              await db.from("wireline_fleet_tasks").insert({
                user_id: userId,
                source_type: "email_thread",
                source_id: threadId,
                target_channel: "phone",
                agent_id: activeAgent?.id || null,
                customer_info: { email: from, subject: subject },
                task_type: "callback_required",
                description: `Lead requested callback via email mailroom. Lead Contact: ${from}`,
                status: "pending",
              });
            } catch (handoffErr) {
              logger.error({ err: handoffErr }, "Email-to-Phone handoff failed");
            }
          }

          await db
            .from("wireline_email_threads")
            .update({
              summary: snippet.substring(0, 100),
              last_message_at: new Date(),
              status: "open",
            })
            .eq("id", existingThread!.id);

          try {
            const emailScoringPrompt = `
                Analyze this email and give a BUSINESS INTENT score (0-100) and CATEGORY ('high', 'medium', 'low', 'none').
                Subject: ${subject}
                Body: ${snippet}
                RESPONSE FORMAT (JSON): { "score": number, "label": string }
              `;
            const sRes = await getGeminiClient().models.generateContent({
              model: "gemini-2.0-flash",
              contents: emailScoringPrompt,
              config: { responseMimeType: "application/json" },
            });
            const sObj = JSON.parse(sRes.text || "{}");
            await db
              .from("wireline_email_threads")
              .update({
                lead_score: sObj.score || 0,
                intent_label: sObj.label || "none",
              })
              .eq("id", existingThread!.id);
          } catch (e) {
            logger.error({ err: e }, "Email scoring failed");
          }
        }
      }

      res.json({ success: true, synced: totalNew });
    } catch (e) {
      logger.error({ err: e }, "Sync Error");
      res.status(500).json({ error: String(e) });
    }
  })
);

router.post(
  "/api/emails/threads/:id/reply",
  rateLimit(RATE_LIMITS.ai),
  authenticateUser,
  validate(replySchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { body } = req.body;
      const { data: thread } = await db
        .from("wireline_email_threads")
        .select("*, wireline_email_accounts(*)")
        .eq("id", req.params.id)
        .eq("user_id", req.user!.id)
        .single();

      if (!thread) throw AppError.notFound("Thread not found");

      const account = thread.wireline_email_accounts;
      const oauth2Client = getGoogleOAuthClient(req);
      oauth2Client.setCredentials({
        access_token: account.access_token,
        refresh_token: account.refresh_token,
        expiry_date: account.expires_at,
      });

      const gmail = google.gmail({ version: "v1", auth: oauth2Client });

      const messageParts = [
        `To: ${thread.customer_email}`,
        `Subject: Re: ${thread.subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
      ];
      const encodedMessage = Buffer.from(messageParts.join("\n"))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        // Bounded `={0,2}` instead of `=+`: base64 padding is at most two
        // `=` characters, so this avoids a CodeQL polynomial-redos flag.
        .replace(/={0,2}$/, "");

      await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: encodedMessage,
          threadId: thread.thread_id,
        },
      });

      await db.from("wireline_email_messages").insert({
        user_id: req.user!.id,
        thread_id: thread.id,
        role: "ai",
        content: body,
      });

      res.json({ success: true });
    } catch (e) {
      if (e instanceof AppError) throw e;
      logger.error({ err: e }, "Reply Error");
      res.status(500).json({ error: String(e) });
    }
  })
);

export default router;
