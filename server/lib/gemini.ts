import { GoogleGenAI } from "@google/genai";

import { env } from "./env";

const client = env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: env.GEMINI_API_KEY }) : null;

if (!env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY is not configured; AI-powered endpoints will fail at call time.");
}

export function getGeminiClient() {
  if (!client) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return client;
}

export function isGeminiConfigured() {
  return Boolean(client);
}
