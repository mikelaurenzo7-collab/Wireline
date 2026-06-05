/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
/**
 * Claude Recipes — Convenience Wrappers
 * ---------------------------------------------------------------------------
 * One function per recipe. Each wraps runStructured or runCompletion with
 * the right system prompt, tool schema, and cost tier. Extracted from
 * claude-brain.ts for maintainability.
 */

import Anthropic from "@anthropic-ai/sdk";
import { selectModelForTask } from "./claude-models";
import { recordUsage } from "./claude-audit";
import { getClient, isClaudeAvailable } from "./claude-client";
import { runStructured, runCompletion } from "./claude-structured";
import { TOOLS, CLIENT_COMMUNICATION_SUPERVISOR_TOOL, SCORE_INTENT_TOOL } from "./claude-tools";
import { log } from "./server-context";
import { EMAIL_INBOUND_UNTRUSTED_RULES, wrapInboundEmailForLlm } from "./email-prompt-safety";

/* ────────────────────────────────────────────────────────────────────────
 *  Role-specific scoring lenses applied on top of the generic analysis prompt.
 * ──────────────────────────────────────────────────────────────────── */

const ROLE_ANALYSIS_GUIDANCE: Record<string, string> = {
  lead_qualifier:
    "This agent qualifies leads (BANT). Score higher when Budget, Authority, Need, and Timeline were all established. Score low if any pillar is missing. Note which BANT pillars were confirmed or absent.",
  scheduler:
    "This agent books appointments. Score higher when a booking was confirmed with a date, time, and confirmation ID. Note if the appointment was successfully booked, rescheduled, or failed.",
  collections:
    "This agent collects payments. Score higher when a payment commitment, arrangement, or promise-to-pay was obtained. Note amount and timeline if discussed.",
  sales:
    "This agent closes deals. Score higher when genuine interest, objection-handling, and a clear next step (demo, proposal, close) occurred.",
  technical_support:
    "This agent resolves technical issues. Score higher when the customer's problem was fully resolved or a concrete resolution path was set. Note resolution status.",
  marketing:
    "This agent runs outreach campaigns. Score higher when the prospect expressed interest, booked a demo, registered for an event, or agreed to a follow-up.",
  receptionist:
    "This agent routes calls and takes messages. Score higher when the caller was properly routed or a complete, accurate message was captured.",
  customer_service:
    "This agent handles support. Score higher when the customer's issue was resolved and satisfaction expressed. Note any unresolved items.",
};

/* ────────────────────────────────────────────────────────────────────────
 *  Convenience wrappers — one per recipe.
 * ──────────────────────────────────────────────────────────────────── */

export interface BriefInput {
  agentName: string;
  agentArchetype: string;
  role?: string;
  customerName?: string;
  customerNumber?: string;
  reasonForCall: string;
  knowledgeBase?: string[];
  pastInteractionSummary?: string;
}

export async function brief(input: BriefInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(`[claude-brain] brief: unknown role "${input.role}" — no role lens applied.`, {
        role: input.role,
      });
  }
  const system = `You are a senior tactical sales coach drafting a pre-call brief for an autonomous voice agent on the Wireline relay.

Agent: ${input.agentName} — Archetype: ${input.agentArchetype}${input.role ? ` — Role: ${input.role}` : ""}.
Be terse, decisive, and tactical. Every recommendation must be specific. No generic platitudes. Use plain English (no jargon, no ALL CAPS, no emoji).${roleGuidance ? `\n\nRole-specific brief lens — ${roleGuidance} The opening line, key questions, and objections you anticipate must reflect what this role actually faces on calls.` : ""}

Knowledge base (use to ground every recommendation):
${(input.knowledgeBase ?? []).map((k) => `• ${k}`).join("\n") || "(none provided)"}`;

  const user = `Customer: ${input.customerName ?? "Unknown"} (${input.customerNumber ?? "no number"})
Reason for call: ${input.reasonForCall}
${input.pastInteractionSummary ? `Past interaction summary: ${input.pastInteractionSummary}` : ""}

Brief the agent for this call now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.brief,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 6144,
  });
}

export interface QualifyInput {
  source: "voice_call" | "email_thread";
  transcript: string;
  metadata?: Record<string, any>;
  role?: string;
}

export async function qualify(input: QualifyInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(`[claude-brain] qualify: unknown role "${input.role}" — no role lens applied.`, {
        role: input.role,
      });
  }
  const system = `You are a senior B2B sales qualification analyst. Score leads against BANT (Budget / Authority / Need / Timeline). Be evidence-driven — every score must reference a specific phrase or signal in the transcript. Be honest: if there's no evidence, score low. Aggregate score is the weighted average (Need 35%, Timeline 25%, Authority 20%, Budget 20%).${roleGuidance ? `\n\nRole-specific qualification lens — ${roleGuidance}` : ""}`;

  const user = `Source: ${input.source}${input.role ? ` · agent role: ${input.role}` : ""}
${input.metadata ? `Metadata: ${JSON.stringify(input.metadata)}` : ""}

--- TRANSCRIPT ---
${input.transcript}
--- END ---

Qualify this lead now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.qualify,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "medium",
  });
}

export interface ObjectionDrillInput {
  agentName: string;
  archetype: string;
  role?: string;
  topic: string;
  count?: number;
}

export async function objectionDrill(input: ObjectionDrillInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(
        `[claude-brain] objectionDrill: unknown role "${input.role}" — no role lens applied.`,
        { role: input.role },
      );
  }
  const system = `You are a sales-coaching AI generating objection-handling drills for the autonomous agent "${input.agentName}" (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""}). Make drills realistic, varied in difficulty, and tied to a recommended response that respects the archetype's tone. Coaching notes should explain *why* the response works.${roleGuidance ? `\n\nRole-specific drill lens — ${roleGuidance} Drills should reflect the objections, edge cases, and compliance pitfalls this role actually encounters.` : ""}`;

  const user = `Topic: ${input.topic}
Generate ${input.count ?? 5} drills covering a range of difficulties.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.objectionDrill,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "medium",
  });
}

export interface ColdEmailInput {
  leadName?: string;
  leadCompany?: string;
  leadRole?: string;
  leadHook?: string;
  ourCompany: string;
  valueProp: string;
  tone?: "warm" | "professional" | "punchy" | "consultative";
  callToAction?: string;
  agentRole?: string;
}

export async function coldEmail(input: ColdEmailInput) {
  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance)
      log.warn(
        `[claude-brain] coldEmail: unknown role "${input.agentRole}" — no role lens applied.`,
        { agentRole: input.agentRole },
      );
  }
  const system = `You are an elite cold-outreach copywriter. Write emails that get replies. Rules:
- Subject line: 4–7 words, no clickbait, hint at value.
- Body: ≤120 words, three short paragraphs max.
- Open with personalization, not "I hope this finds you well".
- One clear call-to-action.
- Plain text only. No markdown.
- Tone: ${input.tone ?? "professional"}.${roleGuidance ? `\n\nSending agent role — ${roleGuidance} The body, hook, and CTA must reflect what this role actually pursues; do not pitch outside its mandate.` : ""}`;

  const user = `Lead: ${input.leadName ?? "(unknown)"} — ${input.leadRole ?? ""} at ${input.leadCompany ?? "(unknown)"}.
Lead hook (specific reason to reach out): ${input.leadHook ?? "(none — write a generic-but-strong opener)"}.
Our company: ${input.ourCompany}.
Value prop: ${input.valueProp}.
CTA: ${input.callToAction ?? "ask for a 15-minute intro call"}.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.coldEmail,
    cacheSystem: true,
    maxTokens: 2048,
    complexity: "medium",
  });
}

export interface PersonaCloneInput {
  description: string;
  samples: string[];
}

export async function personaClone(input: PersonaCloneInput) {
  const system = `You are a voice-cloning prompt engineer. Given samples of how a real person communicates, distill them into a personality block that can drop directly into an LLM's system prompt. Capture tone, cadence, signature phrases, and explicit do/don't rules. Be specific — the resulting persona block must be usable verbatim.`;

  const user = `Person description: ${input.description}

Samples:
${input.samples.map((s, i) => `[Sample ${i + 1}]\n${s}`).join("\n\n")}

Produce the persona now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.personaClone,
    deepThink: true,
    maxTokens: 4096,
  });
}

export interface ThreadSummaryInput {
  subject: string;
  messages: Array<{ role: string; content: string }>;
}

export async function threadSummary(input: ThreadSummaryInput) {
  const system = `You are an executive assistant summarizing email threads for a busy operator. Be ruthlessly concise. Extract action items with explicit owners. If urgency or sentiment is unclear, mark them honestly.`;

  const user = `Subject: ${input.subject}

${input.messages.map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`).join("\n\n")}

Summarize now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.threadSummary,
    maxTokens: 3072,
    complexity: "simple",
  });
}

export interface IntentInput {
  text: string;
}

export async function routeIntent(input: IntentInput) {
  return runStructured({
    system: `You classify customer messages into intents for routing. Be decisive. If uncertain between two, pick the more actionable one and lower confidence accordingly.`,
    user: input.text,
    tool: TOOLS.intent,
    maxTokens: 1024,
    complexity: "simple",
  });
}

export interface AgentReviewInput {
  agentName: string;
  archetype: string;
  role?: string;
  callLogs: Array<{
    summary: string;
    transcript?: string;
    lead_score?: number;
    intent_label?: string;
  }>;
}

export async function agentReview(input: AgentReviewInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(`[claude-brain] agentReview: unknown role "${input.role}" — no role lens applied.`, {
        role: input.role,
      });
  }
  const system = `You are a senior fleet operator reviewing the performance of an autonomous voice agent. Use evidence from the call logs. Be specific, tactical, and willing to be critical. Recommended directives should be concrete instructions the agent can immediately follow — not vague advice. Knowledge entries should be facts/policies that prevent recurring failures.${roleGuidance ? `\n\nRole-specific review lens — ${roleGuidance}` : ""}`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""})

--- LAST ${input.callLogs.length} CALLS ---
${input.callLogs
  .map(
    (l, i) =>
      `Call ${i + 1}${l.lead_score !== undefined ? ` [score ${l.lead_score}, ${l.intent_label ?? "?"}]` : ""}\nSummary: ${l.summary}${
        l.transcript
          ? `\nTranscript: ${l.transcript.slice(0, 1500)}${l.transcript.length > 1500 ? "…" : ""}`
          : ""
      }`,
  )
  .join("\n\n")}
--- END ---

Deliver the review now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.agentReview,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 8192,
    complexity: "medium",
  });
}

export interface SmartDraftInput {
  agentName: string;
  agentTone: string;
  agentRole?: string;
  agentSignature?: string;
  knowledgeBase: string[];
  directives: string[];
  threadSubject: string;
  threadMessages: Array<{ role: string; content: string }>;
  userInstructions?: string;
}

export async function smartDraft(input: SmartDraftInput) {
  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance)
      log.warn(
        `[claude-brain] smartDraft: unknown role "${input.agentRole}" — no role lens applied.`,
        { agentRole: input.agentRole },
      );
  }
  // Stable cacheable prefix: persona + knowledge + directives.
  // Volatile suffix: thread + user instructions.
  const system = `## IDENTITY
You are ${input.agentName}, an autonomous email agent for the company.
Tone: ${input.agentTone}.${input.agentRole ? `\nRole: ${input.agentRole}.${roleGuidance ? ` ${roleGuidance}` : ""}` : ""}

## ABSOLUTE RULES
${input.directives.length ? input.directives.map((d) => `- ${d}`).join("\n") : "(none — exercise good judgment)"}

## KNOWLEDGE BASE
${input.knowledgeBase.length ? input.knowledgeBase.map((k) => `- ${k}`).join("\n") : "(none — be conservative; never invent prices, dates, or policies)"}

## STYLE GUARDRAILS
- Plain text only. No markdown.
- ≤120 words unless the customer's question genuinely demands more.
- Acknowledge the customer's actual question; don't preamble.
- Never invent facts that aren't in the knowledge base — say "I'll check with the team" instead.`;

  const user = `Subject: ${input.threadSubject}

THREAD:
${input.threadMessages
  .map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`)
  .join("\n\n")}

${input.userInstructions ? `OPERATOR INSTRUCTIONS: ${input.userInstructions}` : "Draft a reply that advances the conversation."}

Output the email body only — no subject, no signature.`;

  const result = await runCompletion({
    system,
    user,
    cacheSystem: true,
    maxTokens: 2048,
    complexity: "complex",
  });

  const body = input.agentSignature
    ? `${result.text.trim()}\n\n${input.agentSignature}`
    : result.text.trim();

  return {
    draft: body,
    cacheRead: result.cacheRead,
    cacheCreate: result.cacheCreate,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Single-pass post-call analysis — replaces the 3 Gemini calls in the
 *  vapi webhook with one Claude tool-call returning everything at once.
 * ──────────────────────────────────────────────────────────────────── */

export interface PostCallInput {
  agentName: string;
  archetype: string;
  role?: string;
  customerNumber?: string;
  durationSeconds?: number;
  summary: string;
  transcript: string;
}

export async function postCallAnalysis(input: PostCallInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(
        `[claude-brain] postCallAnalysis: unknown role "${input.role}" — no scoring lens applied.`,
        { role: input.role },
      );
  }
  const system = `You are a senior call analyst delivering post-call enrichment for an autonomous agent on the Wireline relay. Be evidence-driven and concise:
- score lead intent honestly (0–100); if there's no signal, score low.
- extract ONE specific tactical lesson (or empty string if nothing worth promoting).
- list every concrete follow-up the agent promised or the customer asked for.
- flag compliance issues (recording consent, TCPA, GDPR, refund-policy mismatch, etc.).
- list topics the agent couldn't answer authoritatively (knowledge gaps).
${roleGuidance ? `\nRole-specific scoring lens — ${roleGuidance}` : ""}
Use plain English. No jargon, no ALL CAPS, no emoji.`;

  const user = `Agent: ${input.agentName} (archetype: ${input.archetype}${input.role ? `, role: ${input.role}` : ""})
Customer: ${input.customerNumber ?? "(unknown)"}${input.durationSeconds ? ` · ${input.durationSeconds}s` : ""}

--- SUMMARY ---
${input.summary || "(none)"}

--- TRANSCRIPT ---
${input.transcript || "(none)"}
--- END ---`;

  return runStructured({
    system,
    user,
    tool: TOOLS.postCallAnalysis,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "complex",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Live coaching — fast, single-pass.
 * ──────────────────────────────────────────────────────────────────── */

export interface CoachInput {
  agentName: string;
  archetype: string;
  role?: string;
  transcript: string;
  isLive?: boolean;
}

export async function coach(input: CoachInput) {
  let roleGuidance = "";
  if (input.role) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.role] ?? "";
    if (!roleGuidance)
      log.warn(`[claude-brain] coach: unknown role "${input.role}" — no role context applied.`, {
        role: input.role,
      });
  }
  const system = `You are a real-time call coach watching ${input.isLive ? "an in-progress" : "a completed"} call. Identify what is working, what is at risk, and exactly what the agent should say next. Suggested-next-words must be ≤30 words and ready to read aloud verbatim. Be tactical and concise.${roleGuidance ? `\n\nRole context — ${roleGuidance}` : ""}`;
  const user = `Agent: ${input.agentName} (${input.archetype}${input.role ? `, ${input.role}` : ""})

--- TRANSCRIPT ---
${input.transcript}
--- END ---

Coach this conversation now.`;
  return runStructured({
    system,
    user,
    tool: TOOLS.coach,
    deepThink: false,
    cacheSystem: true,
    maxTokens: 2048,
    complexity: "complex",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Agent Forge — synthesize a complete agent from a goal description.
 * ──────────────────────────────────────────────────────────────────── */

export interface AgentForgeInput {
  goal: string;
  industry?: string;
  companyName?: string;
  websiteUrl?: string;
  voicePreference?: string;
}

export async function forgeAgent(input: AgentForgeInput) {
  const system = `You are a senior conversation designer. Given a goal, design a complete autonomous voice/email agent end-to-end: a memorable name, the right archetype, a snappy first message, a self-contained personality block, 5–8 priority-ranked directives, and 5–10 seed knowledge entries. Be opinionated, specific, and brand-appropriate. If a fact isn't known, write a clearly-marked TODO placeholder so the operator can fill it in.`;
  const user = `Goal: ${input.goal}
${input.companyName ? `Company: ${input.companyName}` : ""}
${input.industry ? `Industry: ${input.industry}` : ""}
${input.websiteUrl ? `Website: ${input.websiteUrl}` : ""}
${input.voicePreference ? `Voice preference: ${input.voicePreference}` : ""}

Design the agent now.`;
  return runStructured({
    system,
    user,
    tool: TOOLS.agentForge,
    deepThink: true,
    maxTokens: 6144,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge ingestion from URL
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeFromUrlInput {
  url: string;
  agentContext?: string;
  maxEntries?: number;
  maxPages?: number;
}

export async function knowledgeFromUrl(input: KnowledgeFromUrlInput) {
  const client = getClient();
  const maxPages = Math.max(1, Math.min(input.maxPages ?? 1, 25));
  const isCrawl = maxPages > 1;

  const system = isCrawl
    ? `You are a knowledge-base curator for an autonomous voice/email agent. Crawl the given site by:
1. Fetching the root URL first.
2. Identifying the most important nav/footer links (about, services, products, pricing, hours, contact, faq, policies, locations).
3. Fetching up to ${maxPages} TOTAL pages (including the root). Stop early if you've covered the high-value pages.
4. Stay on the same domain. Never follow outbound or social links.
5. Skip duplicate content (e.g. blog index, search pages, login pages).

After crawling, extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. **Deduplicate entries that say the same thing across multiple pages.** ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} The page_summary should describe the SITE as a whole, not just one page. Then call deliver_knowledge_entries.`
    : `You are a knowledge-base curator for an autonomous voice/email agent. Fetch the URL and extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} After fetching, call deliver_knowledge_entries with the result.`;

  const userPrompt = isCrawl
    ? `Crawl ${input.url} (up to ${maxPages} pages).${input.agentContext ? ` Context for the agent: ${input.agentContext}.` : ""} Then call deliver_knowledge_entries.`
    : `Fetch ${input.url}.${input.agentContext ? ` Context for the agent: ${input.agentContext}.` : ""} Then call deliver_knowledge_entries.`;

  const maxTokens = isCrawl ? 16384 : 8192;

  const tools: Anthropic.Tool[] = [
    { type: "web_fetch_20260209", name: "web_fetch" } as any,
    TOOLS.knowledgeFromUrl,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const model = selectModelForTask("medium");

  let _t = Date.now();
  let response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools,
    messages,
  });
  recordUsage(model, response, Date.now() - _t);

  const safetyCap = isCrawl ? 8 : 3;
  let safety = safetyCap;
  while (response.stop_reason === "pause_turn" && safety-- > 0) {
    messages.push({ role: "assistant", content: response.content });
    _t = Date.now();
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    recordUsage(model, response, Date.now() - _t);
  }

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_knowledge_entries") {
      return block.input as {
        page_summary: string;
        entries: Array<{ fact: string; category: string }>;
      };
    }
  }
  throw new Error(
    `Claude did not return structured knowledge (stop_reason=${response.stop_reason}). Try again or narrow the URL/crawl scope.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge ingestion from a PDF document
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeFromDocumentInput {
  pdfBase64: string;
  fileName?: string;
  agentContext?: string;
  maxEntries?: number;
}

export async function knowledgeFromDocument(input: KnowledgeFromDocumentInput) {
  const client = getClient();
  const system = `You are a knowledge-base curator for an autonomous voice/email agent. Read the provided document and extract every concrete fact a customer-service agent would need: services, pricing, hours, contact info, return/refund policies, FAQ answers, business address, key personnel. Each entry must be atomic, self-contained, and useful in isolation (the agent will quote it verbatim). Skip marketing fluff. ${input.maxEntries ? `Limit to ~${input.maxEntries} entries.` : ""} Then call deliver_knowledge_entries with the result.`;

  const model = selectModelForTask("medium");
  const t0 = Date.now();
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system,
    tools: [TOOLS.knowledgeFromUrl],
    tool_choice: { type: "tool", name: "deliver_knowledge_entries" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: input.pdfBase64,
            },
            ...(input.fileName ? { title: input.fileName } : {}),
          },
          {
            type: "text",
            text: `${input.agentContext ? `Context for the agent: ${input.agentContext}.\n\n` : ""}Extract knowledge entries from this document.`,
          },
        ],
      },
    ],
  });

  recordUsage(model, response, Date.now() - t0);
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_knowledge_entries") {
      return block.input as {
        page_summary: string;
        entries: Array<{ fact: string; category: string }>;
      };
    }
  }
  throw new Error(
    `Claude did not return structured knowledge (stop_reason=${response.stop_reason}).`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Email auto-responder
 * ──────────────────────────────────────────────────────────────────── */

export interface SmartEmailReplyInput {
  agentName: string;
  agentTone: string;
  agentArchetype: string;
  agentRole?: string;
  knowledgeBase: string[];
  directives: string[];
  fromEmail: string;
  subject: string;
  emailBody: string;
  onCheckCalendar?: (date: string) => Promise<string>;
  onBookAppointment?: (args: {
    date: string;
    time: string;
    customer_name: string;
    service_type: string;
  }) => Promise<{ success: boolean; reference_id?: string; error?: string }>;
}

export async function smartEmailReply(input: SmartEmailReplyInput): Promise<{
  replyText: string;
  bookedRef?: string;
}> {
  const client = getClient();

  const tools: Anthropic.Tool[] = [];
  if (input.onCheckCalendar) {
    tools.push({
      name: "check_calendar_availability",
      description: "Check what times are already booked on a specific date.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "The date to check (e.g., 'October 15')." },
        },
        required: ["date"],
      },
    });
  }
  if (input.onBookAppointment) {
    tools.push({
      name: "book_appointment",
      description:
        "Book a service appointment. ONLY call this AFTER confirming the time is open via check_calendar_availability.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string" },
          time: { type: "string" },
          customer_name: { type: "string" },
          service_type: { type: "string" },
        },
        required: ["date", "time", "customer_name", "service_type"],
      },
    });
  }

  let roleGuidance = "";
  if (input.agentRole) {
    roleGuidance = ROLE_ANALYSIS_GUIDANCE[input.agentRole] ?? "";
    if (!roleGuidance)
      log.warn(
        `[claude-brain] smartEmailReply: unknown role "${input.agentRole}" — no role lens applied.`,
        { agentRole: input.agentRole },
      );
  }
  const system = `## IDENTITY
You are ${input.agentName}, an autonomous email agent.
Tone: ${input.agentTone}. Archetype: ${input.agentArchetype}.${input.agentRole ? `\nRole: ${input.agentRole}.${roleGuidance ? ` ${roleGuidance}` : ""}` : ""}

## ABSOLUTE RULES
${input.directives.length ? input.directives.map((d) => `- ${d}`).join("\n") : "(none — exercise good judgment)"}

## KNOWLEDGE BASE
${input.knowledgeBase.length ? input.knowledgeBase.map((k) => `- ${k}`).join("\n") : "(none — be conservative; never invent prices, dates, or policies)"}

## STYLE GUARDRAILS
- Plain text only. No markdown.
- ≤120 words unless the customer's question genuinely demands more.
- Acknowledge the customer's actual question; don't preamble.
- Never invent facts that aren't in the knowledge base — say "I'll check with the team" instead.
- If they want an appointment, use your tools to check availability and book it if confirmed.

${EMAIL_INBOUND_UNTRUSTED_RULES}`;

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: wrapInboundEmailForLlm({
        fromEmail: input.fromEmail,
        subject: input.subject,
        emailBody: input.emailBody,
      }),
    },
  ];

  let bookedRef: string | undefined;
  let safety = 8;

  const model = selectModelForTask("complex");

  while (safety-- > 0) {
    const body: Anthropic.MessageCreateParams = {
      model,
      max_tokens: 4096,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
    };
    if (tools.length) body.tools = tools;

    const _t = Date.now();
    const response = await client.messages.create(body);
    recordUsage(model, response, Date.now() - _t);

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let result = "Tool not implemented.";
        try {
          const args = block.input as any;
          if (block.name === "check_calendar_availability" && input.onCheckCalendar) {
            result = await input.onCheckCalendar(args.date);
          } else if (block.name === "book_appointment" && input.onBookAppointment) {
            const r = await input.onBookAppointment(args);
            if (r.success) {
              bookedRef = r.reference_id;
              result = `Booked. Reference ID: ${r.reference_id ?? "(none)"}.`;
            } else {
              result = r.error || "Booking failed.";
            }
          }
        } catch (e: any) {
          result = `Error: ${e?.message ?? e}`;
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }
      messages.push({ role: "user", content: results });
      continue;
    }

    let replyText = "";
    for (const block of response.content) {
      if (block.type === "text") replyText += block.text;
    }
    return { replyText: replyText.trim() || "I'll follow up shortly.", bookedRef };
  }

  return { replyText: "I'll follow up shortly.", bookedRef };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Email intent scoring
 * ──────────────────────────────────────────────────────────────────── */

export async function scoreIntent(input: { subject?: string; body: string }) {
  return runStructured<{ score: number; label: string; reasoning?: string }>({
    system:
      "You are a B2B intent analyst. Score the message's buying / business intent (0–100) honestly — if there's no signal, score low. Use the score_intent tool.",
    user: `${input.subject ? `Subject: ${input.subject}\n\n` : ""}${input.body}`,
    tool: SCORE_INTENT_TOOL,
    deepThink: false,
    maxTokens: 512,
    complexity: "simple",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Client communication supervision
 * ──────────────────────────────────────────────────────────────────── */

export interface ClientCommunicationReviewInput {
  channel: "email" | "sms";
  agentName?: string;
  source: "voice_tool" | "action_engine" | "cadence" | "email_agent" | "other";
  purpose?: string;
  recipient?: string;
  subject?: string;
  body: string;
  context?: string;
}

export interface ClientCommunicationReviewResult {
  approved: boolean;
  subject: string;
  body: string;
  rationale: string;
  supervisedBy: "opus" | "haiku" | "fallback";
}

export async function superviseClientCommunication(
  input: ClientCommunicationReviewInput,
): Promise<ClientCommunicationReviewResult> {
  const originalSubject = input.subject?.trim() || "";
  const originalBody = input.body.trim();

  if (!originalBody) {
    return {
      approved: false,
      subject: originalSubject,
      body: originalBody,
      rationale: "Message body was empty.",
      supervisedBy: "fallback",
    };
  }

  if (!isClaudeAvailable()) {
    return {
      approved: true,
      subject: originalSubject,
      body: originalBody,
      rationale: "Claude supervisor unavailable; sent original copy.",
      supervisedBy: "fallback",
    };
  }

  const voiceHotPath = input.source === "voice_tool";
  const system = voiceHotPath
    ? `You are a fast compliance reviewer for live phone calls. A voice agent drafted a ${input.channel === "email" ? "email" : "text"} to send after the call. Approve if truthful and safe; reject and rewrite if risky. No adaptive thinking — decide in one pass. Plain text only.`
    : `You are Wireline's boss model. A faster subordinate model drafted a client-facing ${input.channel === "email" ? "email" : "text message"}, and you must review it before it is sent.

Rules:
- Preserve verified facts. Never invent prices, policies, timelines, or commitments.
- Reduce urgency unless the context clearly requires urgency.
- Keep the message plain text and human.
- For email: concise, direct, professional.
- For text: concise, natural, safe to send on a phone.
- If the draft is risky, misleading, or too vague to send, set approved=false and rewrite it into the safest truthful version.`;

  const user = `Channel: ${input.channel}
Source: ${input.source}
Agent: ${input.agentName || "Wireline Agent"}
Recipient: ${input.recipient || "unknown"}
Purpose: ${input.purpose || "general follow-up"}
${input.context ? `Context: ${input.context}` : ""}

Original subject:
${originalSubject || "(none)"}

Original body:
${originalBody}

Review this message now.`;

  try {
    const reviewed = await runStructured<{
      approved: boolean;
      subject: string;
      body: string;
      rationale: string;
    }>({
      system,
      user,
      tool: CLIENT_COMMUNICATION_SUPERVISOR_TOOL,
      deepThink: !voiceHotPath,
      maxTokens: voiceHotPath ? 400 : 1400,
      complexity: voiceHotPath ? "simple" : "complex",
    });

    return {
      approved: reviewed.approved,
      subject: input.channel === "email" ? reviewed.subject.trim() || originalSubject : "",
      body: reviewed.body.trim() || originalBody,
      rationale: reviewed.rationale,
      supervisedBy: voiceHotPath ? "haiku" : "opus",
    };
  } catch (error) {
    try {
      const { log } = await import("./server-context");
      log.warn("Client communication supervision failed; sending original copy", {
        error: (error as { message?: string })?.message,
        channel: input.channel,
        source: input.source,
      });
    } catch {
      /* ignore */
    }

    return {
      approved: true,
      subject: originalSubject,
      body: originalBody,
      rationale: "Supervisor failed; sent original copy.",
      supervisedBy: "fallback",
    };
  }
}

/* ────────────────────────────────────────────────────────────────────────
 *  Daily executive brief
 * ──────────────────────────────────────────────────────────────────── */

export interface DailyBriefInput {
  yesterdayStats: {
    total_calls: number;
    total_minutes: number;
    avg_lead_score: number;
    high_intent_count: number;
    cost: number;
    appointments_booked: number;
    pending_tasks: number;
    new_leads: number;
  };
  weekDelta: {
    calls_pct: number;
    score_pct: number;
    cost_pct: number;
  };
  recentWinSamples: Array<{ customer: string; score: number; summary: string }>;
  recentLossSamples: Array<{ customer: string; score: number; summary: string }>;
  openTasks: Array<{ priority: string; description: string }>;
  ownerName?: string;
}

export async function dailyBrief(input: DailyBriefInput) {
  const system = `You are the chief of staff for a small-business owner running an autonomous voice/email agent fleet on the Wireline relay. Deliver a tight morning brief: what happened yesterday, what's working, what's at risk, and what to do today. Plain English, no jargon, no emoji.`;

  const user = `${input.ownerName ? `Operator: ${input.ownerName}\n` : ""}YESTERDAY (vs 7-day avg):
- Calls: ${input.yesterdayStats.total_calls} (${input.weekDelta.calls_pct >= 0 ? "+" : ""}${input.weekDelta.calls_pct.toFixed(0)}%)
- Avg lead score: ${input.yesterdayStats.avg_lead_score} (${input.weekDelta.score_pct >= 0 ? "+" : ""}${input.weekDelta.score_pct.toFixed(0)}%)
- High-intent leads: ${input.yesterdayStats.high_intent_count}
- Total minutes on the wire: ${input.yesterdayStats.total_minutes}
- Cost: $${input.yesterdayStats.cost.toFixed(2)} (${input.weekDelta.cost_pct >= 0 ? "+" : ""}${input.weekDelta.cost_pct.toFixed(0)}%)
- Appointments booked: ${input.yesterdayStats.appointments_booked}
- New outbound leads queued: ${input.yesterdayStats.new_leads}
- Open tasks: ${input.yesterdayStats.pending_tasks}

WIN SAMPLES:
${input.recentWinSamples.map((s) => `- ${s.customer} (score ${s.score}): ${s.summary}`).join("\n") || "(none)"}

LOSS SAMPLES:
${input.recentLossSamples.map((s) => `- ${s.customer} (score ${s.score}): ${s.summary}`).join("\n") || "(none)"}

TOP OPEN TASKS:
${input.openTasks.map((t) => `- [${t.priority}] ${t.description}`).join("\n") || "(none)"}

Deliver the daily brief now.`;

  return runStructured({
    system,
    user,
    tool: TOOLS.dailyBrief,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 3072,
    complexity: "complex",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Topic clustering
 * ──────────────────────────────────────────────────────────────────── */

export interface TopicClustersInput {
  summaries: Array<{ summary: string; intent_label?: string }>;
  windowDays?: number;
}

export async function clusterTopics(input: TopicClustersInput) {
  const system = `You are a customer-conversation analyst. Cluster the provided call/email summaries into a SHORT list (5–8 max) of meaningful topics. Use plain English topic names that an SMB owner would understand. Estimate trend ('new' / 'growing' / 'steady' / 'declining') based on whether each topic appears more/less in the recent half vs the older half of the data.`;
  const user = `Window: last ${input.windowDays ?? 14} days. ${input.summaries.length} samples.

${input.summaries.map((s, i) => `${i + 1}. [${s.intent_label || "?"}] ${s.summary}`).join("\n")}`;

  return runStructured({
    system,
    user,
    tool: TOOLS.topicClusters,
    deepThink: false,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "medium",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Failure-mode clustering
 * ──────────────────────────────────────────────────────────────────── */

export interface FailureModesInput {
  failedCalls: Array<{
    summary: string;
    transcript?: string;
    lead_score?: number;
    intent_label?: string;
  }>;
}

export async function clusterFailureModes(input: FailureModesInput) {
  const system = `You are a senior agent-operations analyst. Identify recurring failure modes from the provided calls (low lead score, escalations, knowledge gaps, transfer requests). Cluster them, count occurrences, recommend a specific fix per cluster, and tag what kind of fix it is (directive / knowledge / personality / process / other).`;
  const user = `${input.failedCalls.length} failing calls:

${input.failedCalls
  .map(
    (c, i) =>
      `[${i + 1}] score=${c.lead_score ?? "?"} intent=${c.intent_label ?? "?"}\nSummary: ${c.summary}${
        c.transcript
          ? `\nTranscript: ${c.transcript.slice(0, 1200)}${c.transcript.length > 1200 ? "…" : ""}`
          : ""
      }`,
  )
  .join("\n\n")}`;

  return runStructured({
    system,
    user,
    tool: TOOLS.failureModes,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "medium",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Knowledge dedupe
 * ──────────────────────────────────────────────────────────────────── */

export interface KnowledgeDedupeInput {
  facts: Array<{
    id: number;
    agent_name?: string;
    content: string;
  }>;
}

export async function findKnowledgeDuplicates(input: KnowledgeDedupeInput) {
  const system = `You audit an SMB operator's agent knowledge base for clutter. Cluster facts that:
- DUPLICATE: essentially identical wording (whitespace / punctuation / capitalization differences only).
- NEAR_DUPLICATE: same factual content with different phrasing (e.g. "Hours: 9-5" vs "We're open from 9 AM to 5 PM").
- CONTRADICTION: claims that disagree (e.g. "Free shipping over $50" vs "Free shipping over $75").

Rules:
- Use input ids VERBATIM. Never invent ids.
- A cluster MUST have ≥ 2 members. Skip singletons.
- An id should appear in AT MOST one cluster.
- Choose recommended_keep_id from the cluster's members — pick the clearest, most precise wording.
- Provide a suggested_canonical_content that consolidates the cluster ONLY when it materially improves clarity; otherwise omit it.
- Be conservative: when in doubt, do NOT cluster. False positives waste operator time.`;
  const user = `${input.facts.length} facts across the operator's fleet:

${input.facts.map((f) => `[id=${f.id}${f.agent_name ? ` · ${f.agent_name}` : ""}] ${f.content}`).join("\n")}`;

  return runStructured<{
    clusters: Array<{
      kind: "duplicate" | "near_duplicate" | "contradiction";
      reason: string;
      recommended_keep_id: number;
      suggested_canonical_content?: string;
      members: Array<{ id: number; note?: string }>;
    }>;
    total_analyzed: number;
  }>({
    system,
    user,
    tool: TOOLS.knowledgeDedupe,
    deepThink: false,
    cacheSystem: true,
    maxTokens: 4096,
    complexity: "simple",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Lead enrichment
 * ──────────────────────────────────────────────────────────────────── */

export interface EnrichLeadInput {
  customer_number: string;
  customer_name?: string | null;
  context?: string | null;
  industry_hint?: string | null;
}

export interface EnrichLeadResult {
  research_confidence: "high" | "medium" | "low";
  identity_summary: string;
  company_name?: string;
  role?: string;
  industry?: string;
  company_size?: string;
  recent_signals: string[];
  conversation_hooks: string[];
  likely_objections: string[];
  sources: string[];
}

export async function enrichLead(input: EnrichLeadInput): Promise<EnrichLeadResult> {
  const client = getClient();

  const system = `You are a B2B research assistant for an SMB sales operator about to dial a lead. Search the public web and return a structured pre-call enrichment brief.

Search strategy:
- Run 3-5 targeted web_search queries; stop early once you have enough.
- Search for the name + phone area code's likely region for company / role context.
- If you identify a company, search recent news / press / funding signals.
- Skip socially noisy results (paywalled gossip, low-trust forums) unless they corroborate a primary source.

Be honest about confidence:
- HIGH: you found the specific person + employer on a reputable source (LinkedIn, company site, Crunchbase, press).
- MEDIUM: you found a likely match (common name, but role + region / industry context fits).
- LOW: you couldn't pin them down — return what you can about the likely region, industry patterns, or general guidance.

Never fabricate names, employers, or signals — when in doubt, drop confidence and say so in identity_summary. After researching, call deliver_lead_enrichment.`;

  const userPrompt = `Research this lead before the operator dials:
- Phone: ${input.customer_number}
- Name: ${input.customer_name || "(unknown)"}
- Operator context: ${input.context || "(none)"}
- Industry hint: ${input.industry_hint || "(none)"}

Search the web, then call deliver_lead_enrichment.`;

  const tools: Anthropic.Tool[] = [
    { type: "web_search_20250305", name: "web_search", max_uses: 5 } as any,
    TOOLS.enrichLead,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  const model = selectModelForTask("medium");
  const maxTokens = 4096;

  let _t = Date.now();
  let response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    tools,
    messages,
  });
  recordUsage(model, response, Date.now() - _t);

  let safety = 4;
  while (response.stop_reason === "pause_turn" && safety-- > 0) {
    messages.push({ role: "assistant", content: response.content });
    _t = Date.now();
    response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    recordUsage(model, response, Date.now() - _t);
  }

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "deliver_lead_enrichment") {
      return block.input as EnrichLeadResult;
    }
  }
  throw new Error(
    `Claude did not return enrichment (stop_reason=${response.stop_reason}). Try again with more operator context.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  Quick Reply Suggestions
 * ──────────────────────────────────────────────────────────────────── */

export interface QuickRepliesInput {
  agentName: string;
  agentTone: string;
  agentRole?: string;
  agentSignature?: string;
  knowledgeBase: string[];
  threadSubject: string;
  threadMessages: Array<{ role: string; content: string }>;
}

export interface QuickRepliesResult {
  suggestions: Array<{ label: string; body: string }>;
}

export async function quickReplies(input: QuickRepliesInput): Promise<QuickRepliesResult> {
  const system = `You are ${input.agentName}, an email agent${input.agentRole ? ` (${input.agentRole.replace(/_/g, " ")})` : ""}. Tone: ${input.agentTone}.
${input.knowledgeBase.length ? `Knowledge base:\n${input.knowledgeBase.map((k) => `- ${k}`).join("\n")}` : ""}

Generate exactly 3 distinct quick-reply options for the latest customer message.
Each reply must be complete, ready-to-send as-is (≤60 words), with no placeholders or brackets.
Make each option clearly different in approach (e.g., confirming, requesting info, offering alternatives).
Plain text only — no markdown, no lists inside the body.
${input.agentSignature ? `Append this signature to each:\n${input.agentSignature}` : ""}`;

  const lastFew = input.threadMessages.slice(-6);
  const user = `Subject: ${input.threadSubject}

RECENT THREAD:
${lastFew.map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}\n${m.content}`).join("\n\n")}

Deliver 3 quick-reply options using the deliver_quick_replies tool.`;

  return runStructured<QuickRepliesResult>({
    system,
    user,
    tool: TOOLS.quickReplies,
    cacheSystem: true,
    maxTokens: 1024,
    complexity: "complex",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  QA Scoring
 * ──────────────────────────────────────────────────────────────────── */

export interface QaScoreInput {
  direction: "inbound" | "outbound";
  agentRole?: string;
  summary: string;
  transcript: string;
  sentiment?: string;
  durationSeconds?: number;
}

export interface QaScoreResult {
  greeting: number;
  discovery: number;
  solution: number;
  objection: number;
  closing: number;
  coaching_note: string;
  strengths?: string[];
  improvements?: string[];
}

export async function qaScore(input: QaScoreInput): Promise<QaScoreResult> {
  let roleGuidance = "";
  if (input.agentRole) {
    const guidance: Record<string, string> = {
      sales:
        "Sales context: weight discovery and closing heavily. A perfect call has 3+ discovery questions, a compelling pitch tied to the customer's stated pain, and an explicit next step. A failed close (no commitment) is a hard cap on the closing score.",
      lead_qualifier:
        "Lead qualifier context: discovery is the whole job. Score discovery and closing against BANT coverage (Budget, Authority, Need, Timeline). 'Closing' means a clear qualified/disqualified decision + handoff package.",
      collections:
        "Collections context: compliance is paramount. Any FDCPA/TCPA violation (no mini-Miranda, no identity verification, abusive language) → greeting score ≤ 5. Objection handling and payment resolution drive the rest.",
      scheduler:
        "Scheduler context: booking accuracy is the primary metric. A confirmed appointment with date/time/reference ID is a strong close. Failing to check availability before confirming is a critical error.",
      technical_support:
        "Support context: diagnostic rigor is paramount. Award discovery points for structured troubleshooting (one question at a time, systematic elimination). Closing is verified resolution — not just 'let me know if it happens again'.",
      customer_service:
        "Customer service context: emotional acknowledgment and resolution completeness matter most. Award discovery points for understanding the root issue (not just the surface complaint). Closing = customer confirmed satisfaction.",
      receptionist:
        "Receptionist context: routing accuracy and message completeness are everything. Score closing on whether the caller's need was fully addressed — message taken or correct transfer made.",
      marketing:
        "Marketing context: engagement and next-step conversion are the metrics. Score closing based on whether the prospect agreed to any concrete next step (demo, trial, callback). Disengaged exit with no next step = low closing score.",
    };
    roleGuidance = guidance[input.agentRole] ?? "";
  }

  const system = `You are a call quality auditor for an enterprise voice AI platform. Evaluate calls objectively and with specificity — cite concrete moments from the transcript when scoring.${roleGuidance ? `\n\n${roleGuidance}` : ""}`;

  const user = `Score this ${input.direction} call against the 5-dimension QA rubric.

Summary: ${input.summary || "(none)"}
Sentiment: ${input.sentiment || "neutral"}
Duration: ${input.durationSeconds ? Math.round(input.durationSeconds / 60) + " minutes" : "unknown"}
${input.agentRole ? `Agent role: ${input.agentRole.replace(/_/g, " ")}` : ""}

Transcript (up to 3000 chars):
${input.transcript ? input.transcript.slice(0, 3000) + (input.transcript.length > 3000 ? "…" : "") : "(not available)"}

Score each dimension 0–20 and provide a concise, actionable coaching note.`;

  return runStructured<QaScoreResult>({
    system,
    user,
    tool: TOOLS.qaScore,
    deepThink: false,
    cacheSystem: true,
    maxTokens: 512,
    complexity: "medium",
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Call Playbook Builder
 * ──────────────────────────────────────────────────────────────────── */

export interface CallPlaybookInput {
  agentName: string;
  agentRole: string;
  scenario: string;
  knowledgeBase?: string[];
  directives?: string[];
  companyName?: string;
  industry?: string;
}

export interface CallPlaybookResult {
  opening_hook: string;
  purpose_statement: string;
  discovery_questions: Array<{
    question: string;
    intent: string;
    follow_up?: string;
  }>;
  value_prop_script: string;
  objection_handlers: Array<{
    objection: string;
    response: string;
    technique: string;
  }>;
  closing_variants: Array<{
    style: "assumptive" | "alternative_choice" | "soft_ask";
    script: string;
  }>;
  voicemail_script: string;
  success_criteria: string;
}

export async function buildCallPlaybook(input: CallPlaybookInput): Promise<CallPlaybookResult> {
  const roleGuidance: Record<string, string> = {
    sales:
      "This is a revenue-generating call. The playbook must drive toward a demo, proposal, or purchase commitment. Every question should move the prospect closer to a buying decision.",
    lead_qualifier:
      "This is a qualification call. The playbook must systematically uncover BANT (Budget, Authority, Need, Timeline) without feeling like an interrogation. The 'close' is a qualified handoff, not a purchase.",
    collections:
      "This is a collections call. The playbook MUST include the FDCPA mini-Miranda in the opening. Every script line must be compliant. The goal is a payment commitment or arrangement.",
    scheduler:
      "This is a scheduling call. Every script line assumes the goal is booking a confirmed appointment. Include explicit calendar-check prompts before any time commitment.",
    technical_support:
      "This is a support call. The playbook follows a diagnostic hierarchy: environment → restart → configuration → escalation. Discovery questions are diagnostic, not sales-oriented.",
    customer_service:
      "This is a service call. The opening must lead with empathy before solutions. Discovery uncovers the root issue. The close confirms full resolution and customer satisfaction.",
    receptionist:
      "This is a routing call. The opening is the company's first impression. Discovery determines exactly where to route the caller. The close is an accurate transfer or complete message.",
    marketing:
      "This is an outreach/engagement call. The opening must hook with a specific, personalized reference. The goal is booking a demo, event, or next conversation — not a hard sale.",
  };

  const system = `You are a master conversation designer building call playbooks for autonomous voice agents. Every line must be immediately speakable verbatim — no placeholders, no brackets, no curly braces, no angle brackets, no "[INSERT NAME]", no "{{variable}}", no "<your company>", no "COMPANY NAME HERE." Write as if you know the company and scenario perfectly. Be concrete, specific, and tactical.

${roleGuidance[input.agentRole] ?? "Build a professional, effective call playbook."}

${
  input.knowledgeBase?.length
    ? `Knowledge base facts to ground the scripts:\n${input.knowledgeBase
        .slice(0, 20)
        .map((k) => `• ${k}`)
        .join("\n")}`
    : ""
}

${
  input.directives?.length
    ? `Agent directives to respect:\n${input.directives
        .slice(0, 10)
        .map((d) => `• ${d}`)
        .join("\n")}`
    : ""
}`;

  const user = `Build a complete call playbook for:
- Agent: ${input.agentName}
- Role: ${input.agentRole.replace(/_/g, " ")}
- Scenario: ${input.scenario}
${input.companyName ? `- Company: ${input.companyName}` : ""}
${input.industry ? `- Industry: ${input.industry}` : ""}

Make every script line immediately usable. Deliver the playbook now.`;

  return runStructured<CallPlaybookResult>({
    system,
    user,
    tool: TOOLS.callPlaybook,
    deepThink: true,
    cacheSystem: true,
    maxTokens: 6144,
  });
}

/* ────────────────────────────────────────────────────────────────────────
 *  Calendar context builder + utility functions
 * ──────────────────────────────────────────────────────────────────── */

/** Shape of a pre-fetched calendar event row (from wireline_calendar_events). */
export interface CalendarEventRow {
  title: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
}

/**
 * Formats pre-fetched calendar events into a prompt context block.
 * The caller (server.ts) fetches the rows from the DB and injects them here;
 * claude-brain.ts itself makes no database calls (pure function).
 */
export function buildCalendarContext(events: CalendarEventRow[]): string {
  if (!events || events.length === 0) return "";

  const lines = [
    "## CALENDAR AVAILABILITY",
    "You have access to the user's upcoming calendar events. Use this to avoid double-booking and suggest available times.",
  ];

  for (const ev of events) {
    const start = new Date(ev.start_time).toLocaleString("en-US", { timeZoneName: "short" });
    const end = new Date(ev.end_time).toLocaleString("en-US", { timeZoneName: "short" });
    lines.push(`- [${ev.status ?? "confirmed"}] ${ev.title ?? "Busy"}: ${start} to ${end}`);
  }

  return lines.join("\n");
}

/**
 * Extract business actions for the V2A pipeline.
 */
export async function extractActions(params: {
  transcript: string;
  summary: string;
  customerNumber?: string;
}): Promise<any[]> {
  const result = await runStructured({
    system:
      "You are the Wireline Action Engine. Extract follow-up actions promised or implied in the call.",
    user: `Transcript: ${params.transcript}\nSummary: ${params.summary}\nCustomer: ${params.customerNumber || "Unknown"}`,
    tool: TOOLS.businessActions,
    cacheSystem: true,
    complexity: "simple",
  });
  return result.actions;
}

/**
 * Synthesize a tactical lesson from a low-scoring call.
 */
export async function synthesizeLesson(params: {
  transcript: string;
  score: number;
  breakdown: any;
}): Promise<string> {
  const { text } = await runCompletion({
    system:
      "You are the Wireline Agent Coach. Synthesize ONE tactical lesson for the agent based on their failure. =30 words.",
    user: `Score: ${params.score}\nBreakdown: ${JSON.stringify(params.breakdown)}\nTranscript: ${params.transcript}`,
    cacheSystem: true,
    complexity: "medium",
  });
  return text.trim();
}
