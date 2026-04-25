import { Router, type Response } from "express";

import { authenticateUser, type AuthenticatedRequest } from "../lib/auth";
import { env } from "../lib/env";
import { AppError, asyncHandler } from "../lib/errors";
import { logger } from "../lib/logger";
import { db } from "../lib/supabase";
import { normalizePhoneNumber, outboundDialSchema, validate } from "../lib/validation";

const router = Router();

router.get(
  "/api/outbound",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { data } = await db
        .from("wireline_outbound_leads")
        .select("*")
        .eq("user_id", req.user!.id)
        .order("created_at", { ascending: false });
      res.json({ leads: data || [] });
    } catch {
      res.json({ leads: [] });
    }
  })
);

router.post(
  "/api/outbound/dial",
  authenticateUser,
  validate(outboundDialSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, customerName, customerNumber, context } = req.body;
      const userId = req.user!.id;

      const { data: userSettings } = await db
        .from("wireline_settings")
        .select("*")
        .eq("user_id", userId)
        .single();
      const subscriptionStatus = userSettings?.subscription_status || "active";
      if (subscriptionStatus !== "active") {
        throw AppError.forbidden(
          "Access Denied: Please upgrade your billing plan to access outbound dialing."
        );
      }

      const settings = userSettings;
      const vapiSecret = env.VAPI_PRIVATE_KEY;

      if (!vapiSecret || !settings?.vapi_phone_number_id) {
        throw AppError.badRequest(
          "Platform Error: Master telecom carrier not configured. Please ensure VAPI_PRIVATE_KEY is set in environment secrets."
        );
      }

      const [agentConfig, directivesData, knowledgeData, personalityData] = await Promise.all([
        db
          .from("wireline_agents")
          .select("*")
          .eq("id", agentId)
          .eq("user_id", userId)
          .single()
          .then((r) => r),
        db
          .from("wireline_directives")
          .select("content, priority")
          .eq("agent_id", agentId)
          .eq("user_id", userId)
          .order("priority", { ascending: false })
          .then((r) => r),
        db
          .from("wireline_knowledge")
          .select("content")
          .eq("agent_id", agentId)
          .eq("user_id", userId)
          .then((r) => r),
        db
          .from("wireline_personality")
          .select("content")
          .eq("agent_id", agentId)
          .eq("user_id", userId)
          .single()
          .then((r) => r),
      ]);
      if (!agentConfig?.data) {
        throw AppError.notFound("Agent not found.");
      }

      const currentDateTime = new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

      const archetype = agentConfig?.data?.archetype || "Receptionist";
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
    Persona: You are ${agentConfig?.data?.name || "a scheduling agent"}, a representative for our company.
    Tone: Snappy, concise, low-friction.
    The "Secret Sauce": ${archetypeRules}
    Base Personality: ${personalityData?.data?.content || "You are a professional, helpful assistant."}
    ${ambientNoiseActive ? "Ambient Realism: You are working in a busy location. Speak with a slight sense of professional urgency." : ""}

    ## CRITICAL OUTBOUND MISSION CONTEXT
    You are making an OUTBOUND call to a customer named ${customerName || "a customer"}.
    Outbound Call Context / Objective: ${context || "Just checking in on them."}
    You must address this objective naturally during the conversation.

    ## BLOCK 2: TEMPORAL & CONTEXTUAL ANCHORS
    You unmistakably know that today is ${currentDateTime} (Eastern Time). If a customer asks for "tomorrow" or "next week", calculate the date silently and confirm it back to them.

    ## BLOCK 3: CONVERSATIONAL LOOP & GUARDRAILS
    Response Length: Keep every response under 20 words unless explaining a complex process. Long AI monologues feel like robots.
    The "Anti-Echo" Rule: Do not repeat back what the user just said.
    Question Limit: Never ask more than one question at a time.
    Number Formatting: Spell out important numbers if they sound robotic (e.g., "Two zero two" instead of "Two hundred and two").

    ## BLOCK 4: TOOL EXECUTION LOGIC & PROTOCOLS
    Escalation Transfer Rule: If a user asks for a "real person" twice, or asks to transfer, immediately inform them you are transferring them and use the tools.

    ## ABSOLUTE RULES
    ${(directivesData?.data || []).map((d: { priority: number; content: string }) => `[PRIORITY ${d.priority}] ${d.content}`).join("\n")}

    ## KNOWLEDGE BASE
    ${(knowledgeData?.data || []).map((k: { content: string }) => `- ${k.content}`).join("\n")}
    `;

      const vapiPayload = {
        phoneNumberId: settings.vapi_phone_number_id,
        customer: { number: customerNumber },
        assistant: {
          name: agentConfig?.data?.name || "Wireline Outbound Agent",
          firstMessage: `Hi ${customerName ? customerName : "there"}, this is ${agentConfig?.data?.name || "calling from Wireline"}. ${context}`,
          backgroundSound: agentConfig?.data?.ambient_noise || "off",
          model: {
            provider: "google",
            model: "gemini-2.0-flash",
            systemPrompt: systemPrompt,
            temperature: llmTemp,
          },
          recordingEnabled: true,
          voice: {
            provider: agentConfig?.data?.voice_provider || "11labs",
            voiceId: agentConfig?.data?.voice_id || "bIHbv24MWmeRgasZH58o",
          },
        },
      };

      const vapiResponse = await fetch("https://api.vapi.ai/call/phone", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${vapiSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vapiPayload),
      });

      if (!vapiResponse.ok) {
        const errBody = await vapiResponse.text();
        throw new Error(`Vapi API Error: ${errBody}`);
      }

      const vapiData = await vapiResponse.json();

      await db.from("wireline_outbound_leads").insert({
        user_id: userId,
        agent_id: agentId,
        customer_name: typeof customerName === "string" ? customerName.trim() : null,
        customer_number: customerNumber,
        context: typeof context === "string" ? context.trim().slice(0, 1000) : null,
        call_id: vapiData.id,
        status: "Dialing",
      });

      res.json({ success: true, callId: vapiData.id });
    } catch (error: unknown) {
      logger.error({ err: error }, "Outbound call failed");
      if (error instanceof AppError) throw error;
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to dispatch call.",
      });
    }
  })
);

router.post(
  "/api/outbound/bulk",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { leads } = req.body;
      if (!Array.isArray(leads) || !leads.length) {
        return res.status(400).json({ error: "No leads provided" });
      }

      const { data: userSettings } = await db
        .from("wireline_settings")
        .select("subscription_status")
        .eq("user_id", req.user!.id)
        .single();
      if ((userSettings?.subscription_status || "active") !== "active") {
        return res.status(403).json({ error: "Access Denied: Inactive billing plan." });
      }

      type LeadInput = {
        agent_id?: unknown;
        customer_name?: unknown;
        customer_number?: unknown;
        context?: unknown;
        status?: unknown;
      };

      const sanitizedLeads = leads
        .map((lead: LeadInput) => {
          const normalizedNumber = normalizePhoneNumber(lead?.customer_number);
          if (!normalizedNumber) return null;
          return {
            user_id: req.user!.id,
            agent_id: typeof lead?.agent_id === "string" ? lead.agent_id : null,
            customer_name: typeof lead?.customer_name === "string" ? lead.customer_name.trim() : null,
            customer_number: normalizedNumber,
            context: typeof lead?.context === "string" ? lead.context.trim().slice(0, 1000) : null,
            status:
              typeof lead?.status === "string" && lead.status.trim() ? lead.status.trim() : "Queued",
          };
        })
        .filter(
          (lead): lead is NonNullable<typeof lead> => lead !== null
        );

      if (!sanitizedLeads.length) {
        return res.status(400).json({ error: "No valid leads provided." });
      }

      const uniqueAgentIds = [
        ...new Set(sanitizedLeads.map((lead) => lead.agent_id).filter(Boolean) as string[]),
      ];
      if (uniqueAgentIds.length) {
        const { data: ownedAgents } = await db
          .from("wireline_agents")
          .select("id")
          .eq("user_id", req.user!.id)
          .in("id", uniqueAgentIds);
        const ownedAgentIds = new Set((ownedAgents || []).map((ownedAgent) => ownedAgent.id));
        if (uniqueAgentIds.some((agentId) => !ownedAgentIds.has(agentId))) {
          return res
            .status(403)
            .json({ error: "One or more leads reference an agent you do not own." });
        }
      }

      const { data, error } = await db
        .from("wireline_outbound_leads")
        .insert(sanitizedLeads)
        .select("id");
      if (error) throw error;

      res.json({ success: true, inserted: data.length });
    } catch (error) {
      logger.error({ err: error }, "Bulk outbound failed");
      res.status(500).json({ error: "Failed to queue leads" });
    }
  })
);

export default router;
