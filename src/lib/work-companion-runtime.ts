import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { runStructured } from "./ai-structured";
import { drizzle } from "./server-context";

export const WORK_COMPANION_KINDS = [
  "outbound_research",
  "talent_scout",
  "paid_media",
  "creative",
  "account_health",
  "call_brief",
] as const;

export type WorkCompanionKind = (typeof WORK_COMPANION_KINDS)[number];

export type WorkCompanionBrief = {
  kind: WorkCompanionKind;
  subject: string;
  facts: string[];
  inferences: string[];
  pending_approval: string[];
  unresolved: string[];
  call_objective: string;
};

const KIND_SET = new Set<string>(WORK_COMPANION_KINDS);

const KIND_INSTRUCTIONS: Record<WorkCompanionKind, string> = {
  outbound_research: "Research the account and produce a call-ready brief.",
  talent_scout: "Evaluate the candidate or role fit using only supplied facts.",
  paid_media: "Draft campaign messaging angles. Do not change ads.",
  creative: "Draft creative options. Do not publish.",
  account_health: "Summarize account risk and next useful conversation.",
  call_brief: "Produce a compact live-call brief for the next outbound dial.",
};

export function isWorkCompanionKind(value: unknown): value is WorkCompanionKind {
  return typeof value === "string" && KIND_SET.has(value);
}

export function formatWorkCompanionCallPrep(brief: WorkCompanionBrief): string {
  const facts = brief.facts
    .slice(0, 5)
    .map((line) => `- ${line}`)
    .join("\n");
  const unresolved = brief.unresolved
    .slice(0, 3)
    .map((line) => `- ${line}`)
    .join("\n");
  return [
    "## CALL PREP",
    `Objective: ${brief.call_objective}`,
    facts ? `Known facts:\n${facts}` : "",
    unresolved ? `Still unresolved:\n${unresolved}` : "",
    "Do not invent facts. Do not claim an action completed unless a tool confirms it.",
  ]
    .filter(Boolean)
    .join("\n");
}

function normalizeLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

export function normalizeWorkCompanionBrief(
  kind: WorkCompanionKind,
  subject: string,
  raw: Partial<WorkCompanionBrief> | null | undefined,
): WorkCompanionBrief {
  const callObjective =
    typeof raw?.call_objective === "string" && raw.call_objective.trim()
      ? raw.call_objective.trim()
      : `Prepare the next conversation about ${subject}.`;
  return {
    kind,
    subject,
    facts: normalizeLines(raw?.facts),
    inferences: normalizeLines(raw?.inferences),
    pending_approval: normalizeLines(raw?.pending_approval),
    unresolved: normalizeLines(raw?.unresolved),
    call_objective: callObjective.slice(0, 400),
  };
}

export async function runWorkCompanion(input: {
  kind: WorkCompanionKind;
  subject: string;
  context?: string;
}): Promise<WorkCompanionBrief> {
  const subject = input.subject.trim().slice(0, 240);
  if (!subject) throw AppError.fromHttpStatus(400, "Subject is required.");
  const result = await runStructured<Partial<WorkCompanionBrief>>({
    system: [
      "You are drafting for this Wireline agent. Draft only. There is no separate companion to chat with.",
      "Never send email, never dial, never enroll a campaign, never change ads, never generate a video file.",
      "Separate facts from inferences. Mark anything that needs a human as pending_approval.",
      "If a fact is missing, put a question in unresolved instead of inventing it.",
      KIND_INSTRUCTIONS[input.kind],
    ].join(" "),
    user: [`Subject: ${subject}`, input.context?.trim() ? `Context:\n${input.context.trim()}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    tool: {
      name: "work_companion_brief",
      description: "Reviewable prep artifact. Never an action.",
      input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          facts: { type: "array", items: { type: "string" } },
          inferences: { type: "array", items: { type: "string" } },
          pending_approval: { type: "array", items: { type: "string" } },
          unresolved: { type: "array", items: { type: "string" } },
          call_objective: { type: "string" },
        },
        required: ["facts", "inferences", "pending_approval", "unresolved", "call_objective"],
      },
    },
    complexity: "medium",
    maxTokens: 1200,
  });
  return normalizeWorkCompanionBrief(input.kind, subject, result);
}

export async function applyWorkCompanionBrief(input: {
  userId: string;
  agentId?: string | null;
  leadId?: string | null;
  customerNumber?: string | null;
  brief: WorkCompanionBrief;
}): Promise<{ applied: true }> {
  const callPrep = formatWorkCompanionCallPrep(input.brief);
  if (input.agentId && input.brief.facts.length) {
    await drizzle.insert(schema.knowledge).values(
      input.brief.facts.slice(0, 5).map((content) => ({
        userId: input.userId,
        agentId: input.agentId,
        content: content.slice(0, 1000),
      })),
    );
  }
  if (input.leadId) {
    await drizzle
      .update(schema.outboundLeads)
      .set({ context: input.brief.call_objective.slice(0, 2000) })
      .where(
        and(
          eq(schema.outboundLeads.id, BigInt(input.leadId)),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
  }
  const customerNumber = input.customerNumber?.trim() || null;
  if (customerNumber) {
    const [existing] = await drizzle
      .select({
        metadata: schema.leadDossiers.metadata,
      })
      .from(schema.leadDossiers)
      .where(
        and(
          eq(schema.leadDossiers.userId, input.userId),
          eq(schema.leadDossiers.customerNumber, customerNumber),
        ),
      )
      .limit(1);
    const metadata =
      existing?.metadata &&
      typeof existing.metadata === "object" &&
      !Array.isArray(existing.metadata)
        ? { ...(existing.metadata as Record<string, unknown>) }
        : {};
    metadata.work_companion_brief = {
      kind: input.brief.kind,
      call_prep: callPrep,
      pending_approval: input.brief.pending_approval,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      await drizzle
        .update(schema.leadDossiers)
        .set({ metadata })
        .where(
          and(
            eq(schema.leadDossiers.userId, input.userId),
            eq(schema.leadDossiers.customerNumber, customerNumber),
          ),
        );
    } else {
      await drizzle.insert(schema.leadDossiers).values({
        userId: input.userId,
        customerNumber,
        content: callPrep,
        metadata,
      });
    }
  }
  return { applied: true };
}

export async function loadWorkCompanionCallPrep(
  userId: string,
  customerNumber: string | null | undefined,
): Promise<string> {
  const number = customerNumber?.trim();
  if (!number) return "";
  const [row] = await drizzle
    .select({ metadata: schema.leadDossiers.metadata })
    .from(schema.leadDossiers)
    .where(
      and(eq(schema.leadDossiers.userId, userId), eq(schema.leadDossiers.customerNumber, number)),
    )
    .limit(1);
  const metadata =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : null;
  const stored = metadata?.work_companion_brief;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return "";
  const callPrep = (stored as Record<string, unknown>).call_prep;
  return typeof callPrep === "string" && callPrep.trim() ? callPrep.trim().slice(0, 1200) : "";
}
