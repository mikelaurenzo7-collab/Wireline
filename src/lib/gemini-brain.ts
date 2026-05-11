import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * High-speed analysis for live monitoring.
 */
export async function analyzeLiveSentiment(transcript: string): Promise<{
  sentiment: string;
  urgency: number; // 0-10
  escalate: boolean;
  reason: string;
}> {
  try {
    const prompt = `
      Analyze the following live call transcript chunk for escalation risks (anger, legal threats, churn risk).
      Respond ONLY with a JSON object: {"sentiment": string, "urgency": number, "escalate": boolean, "reason": string}
      
      Transcript:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Clean JSON if needed (remove markdown backticks)
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
}> {
  try {
    const prompt = `
      Analyze this call transcript and summary.
      Provide:
      1. lead_score (0-100)
      2. intent_label (one word: lead, support, complaint, unknown)
      3. sentiment (positive, neutral, negative)
      4. lesson (one tactical improvement for the agent)
      5. coaching_note (one sentence for a human manager)
      
      Respond ONLY with valid JSON.
      
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
      intent_label: "unknown",
      sentiment: "neutral",
      lesson: "",
      coaching_note: "Analysis failed"
    };
  }
}
