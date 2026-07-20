/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GEMINI_MODELS } from "./ai-models";
import { recordGeminiUsage } from "./ai-audit";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

/** Grounded search + live sentiment — tier map uses Gemini 2.5 Flash (not voice fallback 3.5). */
export const GEMINI_GROUNDED_MODEL = GEMINI_MODELS.FLASH_2_5;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const flashModel = genAI ? genAI.getGenerativeModel({ model: GEMINI_GROUNDED_MODEL }) : null;

type GeminiGenerateResult = Awaited<
  ReturnType<ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]>
>;

async function generateWithAudit(
  modelId: string,
  run: () => Promise<GeminiGenerateResult>,
): Promise<GeminiGenerateResult> {
  const t0 = Date.now();
  const result = await run();
  recordGeminiUsage(modelId, result.response.usageMetadata, Date.now() - t0);
  return result;
}

function parseGeminiJsonText<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  return JSON.parse(candidate) as T;
}

/** Plain-text Gemini completion for arbitrary system/user prompts. */
export async function runGeminiTextCompletion(input: {
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}): Promise<string> {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");
  const model = genAI.getGenerativeModel({
    model: input.model,
    systemInstruction: input.system,
  });
  const result = await generateWithAudit(input.model, () =>
    model.generateContent({ contents: [{ role: "user", parts: [{ text: input.user }] }] }),
  );
  const text = result.response.text();
  if (!text?.trim()) throw new Error("Gemini returned empty completion");
  return text.trim();
}

/** Structured JSON extraction via any Gemini text model. */
export async function runGeminiJsonCompletion<T>(input: {
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
}): Promise<T> {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");
  const model = genAI.getGenerativeModel({
    model: input.model,
    systemInstruction: input.system,
  });
  const result = await generateWithAudit(input.model, () =>
    model.generateContent({ contents: [{ role: "user", parts: [{ text: input.user }] }] }),
  );
  const text = result.response.text();
  if (!text?.trim()) throw new Error("Gemini returned empty completion");
  return parseGeminiJsonText<T>(text);
}

/**
 * Gemini grounded web search. The `googleSearchRetrieval` tool lets
 * Gemini search the live web during generation and cite its sources.
 * Used by the `gemini_ground` agent tool when an AI agent needs
 * fresh public info that isn't in its knowledge base — competitor
 * pricing, business hours, news, weather, regulations.
 */
export async function groundedSearch(query: string): Promise<{
  answer: string;
  sources: { title?: string; uri?: string }[];
  groundingMode: "pro_grounded" | "flash_fallback" | "unavailable";
}> {
  if (!genAI) {
    return {
      answer: "Grounded search is not configured.",
      sources: [],
      groundingMode: "unavailable",
    };
  }

  try {
    const groundedModel = genAI.getGenerativeModel({
      model: GEMINI_GROUNDED_MODEL,
      tools: [{ googleSearchRetrieval: {} } as any],
    });
    const result = await generateWithAudit(GEMINI_GROUNDED_MODEL, () =>
      groundedModel.generateContent(query),
    );
    const response = result.response;
    const text = response.text().trim();
    const meta =
      (response.candidates?.[0] as any)?.groundingMetadata ||
      (response as any).groundingMetadata ||
      {};
    const chunks: any[] = meta.groundingChunks || meta.grounding_chunks || [];
    const sources = chunks
      .map((c: any) => c.web || c.retrievedContext || c)
      .filter(Boolean)
      .slice(0, 5)
      .map((c: any) => ({ title: c.title, uri: c.uri || c.url }));
    return { answer: text, sources, groundingMode: "pro_grounded" };
  } catch (err) {
    log.warn("Gemini grounded search failed; falling back to flash without grounding", {
      error: getErrorMessage(err),
    });
    try {
      if (!flashModel) throw new Error("flash model unavailable");
      const fallback = await generateWithAudit(GEMINI_GROUNDED_MODEL, () =>
        flashModel.generateContent(query),
      );
      return {
        answer: fallback.response.text().trim(),
        sources: [],
        groundingMode: "flash_fallback",
      };
    } catch (err2) {
      log.error("Gemini fallback also failed", { error: getErrorMessage(err2) });
      return {
        answer: "Unable to look that up right now. I'll make a note and follow up.",
        sources: [],
        groundingMode: "unavailable",
      };
    }
  }
}

/**
 * High-speed analysis for live monitoring.
 */
export async function analyzeLiveSentiment(transcript: string): Promise<{
  sentiment: string;
  urgency: number; // 0-10
  escalate: boolean;
  reason: string;
}> {
  if (!flashModel) {
    return {
      sentiment: "neutral",
      urgency: 0,
      escalate: false,
      reason: "Gemini API key not configured",
    };
  }

  try {
    const prompt = `
      Analyze the following live call transcript chunk for escalation risks (anger, legal threats, churn risk).
      Respond ONLY with a JSON object: {"sentiment": string, "urgency": number, "escalate": boolean, "reason": string}
      
      Transcript:
      ${transcript}
    `;

    const result = await generateWithAudit(GEMINI_GROUNDED_MODEL, () =>
      flashModel.generateContent(prompt),
    );
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    log.error("Gemini live analysis failed", { error: getErrorMessage(err) });
    return { sentiment: "neutral", urgency: 0, escalate: false, reason: "Analysis failed" };
  }
}

/**
 * Full post-call enrichment via Gemini Flash (starter tier / hard-cap fallback).
 */
export async function postCallAnalysis(params: { transcript: string; summary: string }): Promise<{
  lead_score: number;
  intent_label: string;
  sentiment: string;
  lesson: string;
  coaching_note: string;
  action_items?: any[];
  knowledge_gaps?: string[];
  compliance_flags?: string[];
}> {
  if (!flashModel) {
    return {
      lead_score: 0,
      intent_label: "unknown",
      sentiment: "neutral",
      lesson: "",
      coaching_note: "Gemini API key not configured",
    };
  }

  try {
    const prompt = `
      Analyze this call transcript and summary.
      Extract tactical performance data and business intelligence.
      
      Respond ONLY with a valid JSON object:
      {
        "lead_score": number (0-100),
        "intent_label": "high" | "medium" | "low" | "none",
        "sentiment": "positive" | "neutral" | "negative",
        "lesson": "one tactical improvement for the agent",
        "coaching_note": "one sentence for a human manager",
        "compliance_flags": ["TCPA/recording consent/GDPR/refund-policy issues spotted, or empty array"],
        "action_items": [{"description": string, "priority": "high" | "medium" | "low"}],
        "knowledge_gaps": ["topics the agent couldn't answer"]
      }
      
      Flag compliance issues (recording consent, TCPA, GDPR, refund-policy mismatch) in compliance_flags.
      
      Transcript: ${params.transcript}
      Summary: ${params.summary}
    `;

    const result = await generateWithAudit(GEMINI_GROUNDED_MODEL, () =>
      flashModel.generateContent(prompt),
    );
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(jsonStr) as {
      lead_score: number;
      intent_label: string;
      sentiment: string;
      lesson: string;
      coaching_note: string;
      compliance_flags?: string[];
      action_items?: any[];
      knowledge_gaps?: string[];
    };
    if (parsed.compliance_flags?.length) {
      const flags = parsed.compliance_flags.join("; ");
      parsed.coaching_note = `${parsed.coaching_note || ""} [Compliance: ${flags}]`.trim();
    }
    return parsed;
  } catch (err) {
    log.error("Gemini post-call analysis failed", { error: getErrorMessage(err) });
    return {
      lead_score: 0,
      intent_label: "none",
      sentiment: "neutral",
      lesson: "",
      coaching_note: "Analysis failed",
    };
  }
}
