// src/lib/grokClient.ts
// xAI Grok 4.3 client for Wireline Director chat
// Uses official xAI OpenAI-compatible endpoint via the openai package

import OpenAI from "openai";
import { log } from "./server-context";

const XAI_API_KEY = process.env.XAI_API_KEY;
const XAI_BASE_URL = process.env.XAI_BASE_URL || "https://api.x.ai/v1";

if (!XAI_API_KEY) {
  log.warn("XAI_API_KEY is not set. Director chat will fail in production.");
}

export const xaiClient = new OpenAI({
  apiKey: XAI_API_KEY,
  baseURL: XAI_BASE_URL,
});

/**
 * Call The Director (Grok 4.3) with full context.
 * Returns a streaming response.
 */
export async function callDirectorGrok({
  systemPrompt,
  userMessage,
  history = [],
  temperature = 0.45,
  maxTokens = 6000,
}: {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const stream = await xaiClient.chat.completions.create({
    model: "grok-4.3", // Confirm latest model name in xAI console
    messages,
    temperature,
    top_p: 0.92,
    max_tokens: maxTokens,
    frequency_penalty: 0.15,
    presence_penalty: 0.1,
    stream: true,
  });

  return stream;
}

/**
 * Non-streaming version (useful for testing or tool calls)
 */
export async function callDirectorGrokSync({
  systemPrompt,
  userMessage,
  history = [],
  temperature = 0.45,
}: {
  systemPrompt: string;
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
}) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const response = await xaiClient.chat.completions.create({
    model: "grok-4.3",
    messages,
    temperature,
    top_p: 0.92,
    max_tokens: 6000,
    frequency_penalty: 0.15,
    presence_penalty: 0.1,
    stream: false,
  });

  return response.choices[0]?.message?.content || "";
}
