/**
 * Founder agent seed - provisions the platform owner's account with a
 * full roster of agents, max capabilities, and training artifacts so
 * Mike can dogfood chat, training, and integrations end-to-end.
 */
import { and, eq, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { WIRELINE_PERSONAS } from "./wireline-agent-personas";
import type { WirelinePersonaId } from "./wireline-agent-escalation";
import { AGENT_TOOL_NAME_VALUES, type AgentToolName } from "./agent-capabilities";
import { ROLE_PERSONALITY_TEMPLATES } from "./agent-constants";
import { pickRotatedVoiceId } from "../data/voice-roster";
import { getOwnerEmails } from "./auth-service";

export const ALL_AGENT_TOOLS: AgentToolName[] = [...AGENT_TOOL_NAME_VALUES];

const CHAT_COLLABORATOR_OVERLAY = `

CHAT MODE (operator workspace):
You are also a full AI collaborator in private chat — not just a voice agent. In chat you can:
- Draft business plans, GTM strategies, SOPs, email sequences, and marketing copy tailored to the operator's business.
- Outline logo concepts, brand voice guides, and pitch decks (for production logo SVGs, suggest the Director chat).
- Propose config changes, tool toggles, and outbound actions via approval cards — never mutate settings silently.
- Coach the operator on call performance, objection handling, and agent strategy using your role expertise.
Be substantive, structured, and actionable. Match the operator's industry when known.`;

export interface AssistantAgentTemplate {
  id: string;
  name: string;
  role: string;
  channel: "voice" | "email";
  archetype: string;
  firstMessage: string;
  personalityVibe?: "warm" | "playful" | "authoritative";
  emailAgentTone?: string;
  emailSignature?: string;
  websiteUrl?: string;
  wirelinePersonaId?: WirelinePersonaId;
}

/** Vertical + specialty agents beyond the 6 internal Wireline personas. */
export const FOUNDER_FLEET_TEMPLATES: AssistantAgentTemplate[] = [
  {
    id: "founder-jordan",
    name: "Jordan",
    role: "customer_service",
    channel: "voice",
    archetype: "Receptionist",
    firstMessage: "Hi, Jordan here. Thanks for calling — what can I help you with today?",
    personalityVibe: "warm",
    websiteUrl: "https://trywireline.com",
  },
  {
    id: "founder-marcus",
    name: "Marcus",
    role: "scheduler",
    channel: "voice",
    archetype: "Scheduler",
    firstMessage: "Hi, this is Marcus. I can help you book or reschedule — what's your name?",
    personalityVibe: "authoritative",
  },
  {
    id: "founder-diana",
    name: "Diana",
    role: "lead_qualifier",
    channel: "voice",
    archetype: "Intake Specialist",
    firstMessage:
      "Diana here — I'll get a few details so we route you correctly. May I have your name?",
    personalityVibe: "authoritative",
  },
  {
    id: "founder-aisha",
    name: "Aisha",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage: "Hey, Aisha here. Are you looking at listings or thinking about selling?",
    personalityVibe: "playful",
  },
  {
    id: "founder-elena",
    name: "Elena",
    role: "customer_service",
    channel: "voice",
    archetype: "Claims Intake",
    firstMessage:
      "Elena with client services — can I get your name and policy number if you have it?",
    personalityVibe: "warm",
  },
  {
    id: "founder-jake",
    name: "Jake",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage: "Hey, Jake here from the growth team. Who am I speaking with?",
    personalityVibe: "playful",
  },
  {
    id: "founder-billing",
    name: "Billing Specialist",
    role: "collections",
    channel: "voice",
    archetype: "The Collector",
    firstMessage: "Billing department — how can I help with your account today?",
    personalityVibe: "authoritative",
  },
  {
    id: "founder-prospector",
    name: "Outbound Prospector",
    role: "sales",
    channel: "voice",
    archetype: "The Closer",
    firstMessage: "Hi there — calling from the growth team. Got a quick minute?",
    personalityVibe: "playful",
  },
  {
    id: "founder-growth-email",
    name: "Growth Coordinator",
    role: "marketing",
    channel: "email",
    archetype: "Receptionist",
    firstMessage: "Thanks for reaching out — happy to help with campaigns or follow-ups.",
    personalityVibe: "playful",
    emailAgentTone: "Friendly",
    emailSignature: "— The Growth Team, Wireline",
  },
  {
    id: "founder-tier2",
    name: "Tier 2 Technical Lead",
    role: "technical_support",
    channel: "voice",
    archetype: "Support Tech",
    firstMessage: "Wireline Technical Support — what symptoms are you seeing?",
    personalityVibe: "warm",
  },
  {
    id: "founder-personal",
    name: "Personal Assistant",
    role: "personal_assistant",
    channel: "voice",
    archetype: "Executive Assistant",
    firstMessage: "Hi, this is your agent. How can I help with your schedule today?",
    personalityVibe: "warm",
  },
];

/** Minimum agents after a full founder seed (6 personas + specialty roster). */
export const EXPECTED_FOUNDER_FLEET_AGENT_COUNT =
  Object.keys(WIRELINE_PERSONAS).length + FOUNDER_FLEET_TEMPLATES.length;

const KNOWLEDGE_SNIPPETS: Record<string, string[]> = {
  default: [
    "Free Builder creates and trains for free; Starter, Starter Plus, Pro, and Business unlock guaranteed live-voice minutes plus Conversation Balance for anything beyond that.",
    "Operators configure agents via Create, Training, Wire or Integrations, and Studio.",
    "Escalations route to the configured phone/email; use escalate_to_human when risk is high.",
  ],
  sales: [
    "Lead with outcome before features. Always propose a concrete next step before ending the conversation.",
    "Business plan outline: Problem → ICP → Offer → Channels → Unit economics → 90-day milestones.",
  ],
  customer_service: [
    "Use HEARD: Hear, Empathize, Apologize, Resolve, Diagnose. Never transfer without context.",
  ],
  collections: [
    "Always verify identity before discussing balances. Log every promise-to-pay immediately.",
  ],
  marketing: ["Campaign brief template: Audience → Hook → Offer → CTA → Success metric."],
};

const DIRECTIVE_SNIPPETS: string[] = [
  "Always confirm spelling of names and callback numbers before ending a call.",
  "If the caller asks for a human, escalate immediately — no friction.",
  "In chat, draft deliverables (plans, copy, briefs) in structured sections the operator can approve or edit.",
  "Never invent integration credentials — say when an integration needs to be connected in Settings.",
];

const LESSON_SNIPPETS: string[] = [
  "When price objections arise, acknowledge first then reframe around ROI and cost of inaction.",
  "For scheduling, always read back date, time, timezone, and contact method before closing.",
  "In chat, offer to turn a business plan outline into config changes (greeting, tone, tools) when relevant.",
  "Logo requests in agent chat -> outline concepts here; send the operator to Studio for brand artifacts.",
];

function personalityForRole(role: string): string {
  const key = role in ROLE_PERSONALITY_TEMPLATES ? role : "customer_service";
  return (
    (ROLE_PERSONALITY_TEMPLATES[key as keyof typeof ROLE_PERSONALITY_TEMPLATES] ||
      ROLE_PERSONALITY_TEMPLATES.customer_service) + CHAT_COLLABORATOR_OVERLAY
  );
}

function knowledgeForRole(role: string): string[] {
  const base = KNOWLEDGE_SNIPPETS.default;
  if (role.includes("sales") || role === "marketing") return [...base, ...KNOWLEDGE_SNIPPETS.sales];
  if (role === "collections") return [...base, ...KNOWLEDGE_SNIPPETS.collections];
  if (role === "marketing") return [...base, ...KNOWLEDGE_SNIPPETS.marketing];
  if (role === "customer_service" || role.includes("reception")) {
    return [...base, ...KNOWLEDGE_SNIPPETS.customer_service];
  }
  return base;
}

export interface FounderAssistantSeedReport {
  agentsCreated: number;
  agentsUpdated: number;
  knowledgeInserted: number;
  directivesInserted: number;
  lessonsInserted: number;
  agentIds: string[];
}

/** Tenant-scoped agent lookup — never match global template ids across users. */
export function founderAssistantAgentScope(agentId: string, userId: string) {
  return and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId));
}

/** When canonical template ids are already owned by another tenant, namespace per user. */
export function namespacedAssistantAgentId(templateId: string, userId: string): string {
  return `${userId.slice(0, 8)}-${templateId}`;
}

export async function resolveAssistantAgentId(templateId: string, userId: string): Promise<string> {
  const [ownedCanonical] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(founderAssistantAgentScope(templateId, userId))
    .limit(1);
  if (ownedCanonical) return templateId;

  const namespaced = namespacedAssistantAgentId(templateId, userId);
  const [ownedNamespaced] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(founderAssistantAgentScope(namespaced, userId))
    .limit(1);
  if (ownedNamespaced) return namespaced;

  const [collision] = await drizzle
    .select({ userId: schema.agents.userId })
    .from(schema.agents)
    .where(eq(schema.agents.id, templateId))
    .limit(1);
  if (collision && collision.userId !== userId) return namespaced;

  return templateId;
}

async function upsertPersonality(agentId: string, userId: string, content: string): Promise<void> {
  const [existing] = await drizzle
    .select({ agentId: schema.personality.agentId })
    .from(schema.personality)
    .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)))
    .limit(1);
  if (existing) {
    await drizzle
      .update(schema.personality)
      .set({ content })
      .where(and(eq(schema.personality.agentId, agentId), eq(schema.personality.userId, userId)));
    return;
  }

  const [foreign] = await drizzle
    .select({ agentId: schema.personality.agentId })
    .from(schema.personality)
    .where(eq(schema.personality.agentId, agentId))
    .limit(1);
  if (foreign) {
    log.warn("founder agent seed: personality row owned by another tenant, skipping", {
      agentId,
      userId,
    });
    return;
  }

  await drizzle.insert(schema.personality).values({ agentId, userId, content });
}

async function seedTrainingArtifacts(
  agentId: string,
  userId: string,
  role: string,
  report: FounderAssistantSeedReport,
): Promise<void> {
  for (const content of knowledgeForRole(role)) {
    const exists = await drizzle
      .select({ id: schema.knowledge.id })
      .from(schema.knowledge)
      .where(
        and(
          eq(schema.knowledge.agentId, agentId),
          eq(schema.knowledge.userId, userId),
          eq(schema.knowledge.content, content),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await drizzle.insert(schema.knowledge).values({ agentId, userId, content });
      report.knowledgeInserted++;
    }
  }

  for (const [i, content] of DIRECTIVE_SNIPPETS.entries()) {
    const exists = await drizzle
      .select({ id: schema.directives.id })
      .from(schema.directives)
      .where(
        and(
          eq(schema.directives.agentId, agentId),
          eq(schema.directives.userId, userId),
          eq(schema.directives.content, content),
        ),
      )
      .limit(1);
    if (exists.length === 0) {
      await drizzle.insert(schema.directives).values({
        agentId,
        userId,
        content,
        priority: 10 - i,
      });
      report.directivesInserted++;
    }
  }

  for (const lesson of LESSON_SNIPPETS) {
    try {
      await drizzle.insert(schema.agentLessons).values({
        agentId,
        userId,
        lesson,
        source: "founder-agent-seed",
      });
      report.lessonsInserted++;
    } catch {
      // unique (agent_id, lesson) — already seeded
    }
  }
}

async function upsertAgent(
  userId: string,
  template: AssistantAgentTemplate,
  voiceIndex: number,
  report: FounderAssistantSeedReport,
): Promise<string> {
  const toolsJson = ALL_AGENT_TOOLS;
  const agentId = await resolveAssistantAgentId(template.id, userId);
  const tenantScope = founderAssistantAgentScope(agentId, userId);
  const [existing] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(tenantScope)
    .limit(1);

  const businessVariables = template.wirelinePersonaId
    ? {
        wireline_internal: true,
        wireline_persona_id: template.wirelinePersonaId,
        provisioned_at: new Date().toISOString(),
      }
    : { founder_fleet_seed: true, seeded_at: new Date().toISOString() };

  const values = {
    userId,
    name: template.name,
    role: template.role,
    channel: template.channel,
    archetype: template.archetype,
    firstMessage: template.firstMessage,
    voiceId: pickRotatedVoiceId(voiceIndex),
    voiceProvider: "vapi",
    enabledTools: toolsJson,
    personalityVibe: template.personalityVibe || "warm",
    emailAgentTone: template.emailAgentTone,
    emailSignature: template.emailSignature,
    websiteUrl: template.websiteUrl,
    businessVariables,
    emailAutoRespond: template.channel === "email",
  };

  if (existing) {
    await drizzle
      .update(schema.agents)
      .set({
        ...values,
        enabledTools: toolsJson,
      })
      .where(tenantScope);
    report.agentsUpdated++;
  } else {
    await drizzle.insert(schema.agents).values({ id: agentId, ...values });
    report.agentsCreated++;
  }

  await upsertPersonality(agentId, userId, personalityForRole(template.role));
  await seedTrainingArtifacts(agentId, userId, template.role, report);
  report.agentIds.push(agentId);
  return agentId;
}

/**
 * Seed (or refresh) the founder's full agent roster with max capabilities
 * and training artifacts. Idempotent — safe to re-run.
 */
export async function seedFounderAssistant(userId: string): Promise<FounderAssistantSeedReport> {
  const report: FounderAssistantSeedReport = {
    agentsCreated: 0,
    agentsUpdated: 0,
    knowledgeInserted: 0,
    directivesInserted: 0,
    lessonsInserted: 0,
    agentIds: [],
  };

  let voiceIndex = 0;

  // 6 internal Wireline personas
  for (const persona of Object.values(WIRELINE_PERSONAS)) {
    await upsertAgent(
      userId,
      {
        id: `wireline-${persona.id}`,
        name: persona.name,
        role: persona.role,
        channel: "voice",
        archetype: "Receptionist",
        firstMessage: persona.firstMessage,
        wirelinePersonaId: persona.id,
        personalityVibe:
          persona.id === "sales" || persona.id === "onboarding"
            ? "playful"
            : persona.id === "support" || persona.id === "technical"
              ? "authoritative"
              : "warm",
      },
      voiceIndex++,
      report,
    );
  }

  // Specialty + vertical roster
  for (const template of FOUNDER_FLEET_TEMPLATES) {
    await upsertAgent(userId, template, voiceIndex++, report);
  }

  // Ensure every existing owner agent also gets max tools (legacy rows)
  const ownerAgents = await drizzle
    .select({ id: schema.agents.id, role: schema.agents.role })
    .from(schema.agents)
    .where(eq(schema.agents.userId, userId));

  for (const row of ownerAgents) {
    if (!report.agentIds.includes(row.id)) {
      await drizzle
        .update(schema.agents)
        .set({ enabledTools: ALL_AGENT_TOOLS })
        .where(eq(schema.agents.id, row.id));
      await seedTrainingArtifacts(row.id, userId, row.role || "customer_service", report);
      report.agentIds.push(row.id);
      report.agentsUpdated++;
    }
  }

  log.info("founder agent seed completed", { userId, ...report });
  return report;
}

export async function resolveFounderUserId(ownerEmail?: string): Promise<string | null> {
  const email = (ownerEmail || process.env.OWNER_EMAIL || [...getOwnerEmails()][0] || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  const [row] = await drizzle
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(trim(${schema.users.email})) = ${email}`)
    .limit(1);
  return row?.id ?? null;
}
