import { GoogleGenerativeAI } from "@google/generative-ai";
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
