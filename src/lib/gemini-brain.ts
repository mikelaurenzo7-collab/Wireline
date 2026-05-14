import { GoogleGenerativeAI } from "@google/generative-ai";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const model = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

/**
 * High-speed analysis for live monitoring.
 */
export async function analyzeLiveSentiment(transcript: string): Promise<{
  sentiment: string;
  urgency: number; // 0-10
  escalate: boolean;
  reason: string;
}> {
  if (!model) {
    return { sentiment: "neutral", urgency: 0, escalate: false, reason: "Gemini API key not configured" };
  }

  try {
    const prompt = `
      Analyze the following live call transcript chunk for escalation risks (anger, legal threats, churn risk).
      Respond ONLY with a JSON object: {"sentiment": string, "urgency": number, "escalate": boolean, "reason": string}
      
      Transcript:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    log.error("Gemini live analysis failed", { error: getErrorMessage(err) });
    return { sentiment: "neutral", urgency: 0, escalate: false, reason: "Analysis failed" };
  }
}

/**
 * Full post-call enrichment via Gemini Flash.
 */
export async function postCallAnalysis(params: {
  transcript: string;
  summary: string;
}): Promise<{
  lead_score: number;
  intent_label: string;
  sentiment: string;
  lesson: string;
  coaching_note: string;
  action_items?: any[];
  knowledge_gaps?: string[];
}> {
  if (!model) {
    return {
      lead_score: 0,
      intent_label: "unknown",
      sentiment: "neutral",
      lesson: "",
      coaching_note: "Gemini API key not configured"
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
        "action_items": [{"description": string, "priority": "high" | "medium" | "low"}],
        "knowledge_gaps": ["topics the agent couldn't answer"]
      }
      
      Transcript: ${params.transcript}
      Summary: ${params.summary}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    log.error("Gemini post-call analysis failed", { error: getErrorMessage(err) });
    return {
      lead_score: 0,
      intent_label: "none",
      sentiment: "neutral",
      lesson: "",
      coaching_note: "Analysis failed"
    };
  }
}
