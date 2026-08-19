import type { NextFunction, Request, Response } from "express";

import { BOTBOUND_BRAND_NAME, LEGACY_WIRELINE_NAME } from "./brand";

export type ShowcasePromptKind = "cs" | "demo";

type VapiMessage = {
  role?: string;
  content?: unknown;
};

type VapiModelConfig = {
  provider?: string;
  model?: string;
  fallbackModels?: string[];
  messages?: VapiMessage[];
};

type ShowcaseAssistantPayload = {
  name?: string;
  firstMessage?: string;
  model?: VapiModelConfig;
};

const BOTBOUND_DEMO_MARKER = `showcase demo built by ${BOTBOUND_BRAND_NAME}`;
const BOTBOUND_CS_MARKER = `a real ${BOTBOUND_BRAND_NAME} employee on a real ${BOTBOUND_BRAND_NAME} line`;
const LEGACY_DEMO_MARKER = `showcase demo built by ${LEGACY_WIRELINE_NAME}`;
const LEGACY_CS_MARKER = `a real ${LEGACY_WIRELINE_NAME} employee on a real ${LEGACY_WIRELINE_NAME} line`;

const SHOWCASE_PROMPT_MARKERS = [
  BOTBOUND_DEMO_MARKER,
  BOTBOUND_CS_MARKER,
  LEGACY_DEMO_MARKER,
  LEGACY_CS_MARKER,
] as const;

const FORBIDDEN_SHOWCASE_CLAIMS = [
  "auditor engaged",
  "target Q4 2026",
  "on request (~30 day onboarding)",
  "BAA available on the Enterprise roadmap",
  "14-day free trial",
  "Personal $49",
  "Starter $149",
  "Pro $499",
  "Business $1,499",
] as const;

const OPENAI_SHOWCASE_FALLBACK = "gpt-5.6-luna";
const GOOGLE_SHOWCASE_FALLBACK = "gemini-2.5-flash";

function systemPrompt(payload: ShowcaseAssistantPayload): {
  message: VapiMessage;
  content: string;
} | null {
  const message = payload.model?.messages?.find((candidate) => candidate?.role === "system");
  return message && typeof message.content === "string"
    ? { message, content: message.content }
    : null;
}

function showcaseKind(prompt: string): ShowcasePromptKind | null {
  if (prompt.includes(BOTBOUND_DEMO_MARKER) || prompt.includes(LEGACY_DEMO_MARKER)) return "demo";
  if (prompt.includes(BOTBOUND_CS_MARKER) || prompt.includes(LEGACY_CS_MARKER)) return "cs";
  return null;
}

function replaceLiteral(source: string, from: string, to: string): string {
  return source.includes(from) ? source.split(from).join(to) : source;
}

function migrateLegacyBrand(source: string): string {
  let migrated = replaceLiteral(source, LEGACY_WIRELINE_NAME, BOTBOUND_BRAND_NAME);
  migrated = replaceLiteral(migrated, LEGACY_WIRELINE_NAME.toUpperCase(), BOTBOUND_BRAND_NAME);
  return migrated;
}

function setCompatibleFallbacks(
  model: VapiModelConfig,
  compatible: string[],
  managedFallback: string,
  primary: string,
): void {
  if (compatible.length) {
    model.fallbackModels = compatible;
    return;
  }
  if (!primary || primary === managedFallback) {
    delete model.fallbackModels;
    return;
  }
  model.fallbackModels = [managedFallback];
}

function makeModelFallbacksProviderCoherent(model: VapiModelConfig | undefined): void {
  if (!model) return;
  const provider = String(model.provider || "")
    .trim()
    .toLowerCase();
  const primary = String(model.model || "").trim();
  const configured = Array.isArray(model.fallbackModels) ? model.fallbackModels : [];

  if (provider === "openai") {
    const compatible = configured.filter(
      (candidate) => /^gpt-/i.test(candidate) && candidate !== primary,
    );
    setCompatibleFallbacks(model, compatible, OPENAI_SHOWCASE_FALLBACK, primary);
    return;
  }

  if (provider === "google") {
    const compatible = configured.filter(
      (candidate) => /^gemini-/i.test(candidate) && candidate !== primary,
    );
    setCompatibleFallbacks(model, compatible, GOOGLE_SHOWCASE_FALLBACK, primary);
    return;
  }

  // Vapi's XaiModel DTO rejects fallbackModels. Continuity is application retry.
  delete model.fallbackModels;
}

function migrateShowcaseIdentityFields(payload: ShowcaseAssistantPayload): void {
  if (typeof payload.name === "string") payload.name = migrateLegacyBrand(payload.name);
  if (typeof payload.firstMessage === "string") {
    payload.firstMessage = migrateLegacyBrand(payload.firstMessage);
  }
}

function isCapacityAssistant(payload: ShowcaseAssistantPayload): boolean {
  const name = String(payload.name || "");
  const firstMessage = String(payload.firstMessage || "");
  return /\(at capacity\)$/i.test(name) && /demo line/i.test(firstMessage);
}

/**
 * Last-mile guard for public Vapi prompts and model payloads.
 *
 * It recognizes both current and legacy provider objects during the migration,
 * rewrites legacy customer branding to BotBound, and then enforces the same
 * compliance-truth and provider-model constraints as before the rename.
 */
export function sanitizeShowcaseAssistantPayload<T extends ShowcaseAssistantPayload>(
  payload: T,
): T {
  migrateShowcaseIdentityFields(payload);

  const promptRow = systemPrompt(payload);
  if (!promptRow) return payload;

  const kind = showcaseKind(promptRow.content);
  if (!kind) {
    // The bounded at-capacity assistant intentionally has no full showcase
    // system prompt. Its name/firstMessage were still normalized above.
    return payload;
  }

  makeModelFallbacksProviderCoherent(payload.model);

  let prompt = migrateLegacyBrand(promptRow.content);
  prompt = replaceLiteral(
    prompt,
    "SOC 2 Type II - auditor engaged, target Q4 2026",
    `SOC 2 readiness work is in progress; ${BOTBOUND_BRAND_NAME} is not SOC 2 certified today`,
  );
  prompt = replaceLiteral(
    prompt,
    "HIPAA BAA - Enterprise tier only, on request (~30 day onboarding)",
    `HIPAA and BAA support are not currently available; do not present ${BOTBOUND_BRAND_NAME} as HIPAA-certified`,
  );
  prompt = replaceLiteral(
    prompt,
    "not currently HIPAA-certified (BAA available on the Enterprise roadmap)",
    "not HIPAA-certified; HIPAA and BAA support are not currently available",
  );
  prompt = replaceLiteral(
    prompt,
    "Authoritative, calm, HIPAA-aware tone",
    "Authoritative, calm, privacy-conscious administrative tone",
  );
  prompt = replaceLiteral(
    prompt,
    `If asked about HIPAA: ${BOTBOUND_BRAND_NAME} is not HIPAA-certified today; BAA is on the Enterprise roadmap, say that plainly.`,
    `If asked about HIPAA: ${BOTBOUND_BRAND_NAME} is not HIPAA-certified and BAA support is not currently available, say that plainly.`,
  );
  prompt = replaceLiteral(
    prompt,
    `If asked about HIPAA: ${BOTBOUND_BRAND_NAME} is not HIPAA-certified today; BAA is on the Enterprise roadmap. Say that plainly.`,
    `If asked about HIPAA: ${BOTBOUND_BRAND_NAME} is not HIPAA-certified and BAA support is not currently available. Say that plainly.`,
  );

  prompt = prompt.replace(
    /^- Integrations: .*$/m,
    "- Optional connectors can include HubSpot, Salesforce, Apollo, Slack, Microsoft Teams, and DocuSign when connected and currently available. Verify the live Connections page before promising any connector.",
  );

  if (kind === "demo") {
    prompt = replaceLiteral(
      prompt,
      "- If something goes wrong with a tool or action, never say 'error' or any technical term. Just say 'Let me note that and have someone follow up' and move on.",
      "- If a tool or action does not confirm success, say it did not go through. Offer the direct self-service URL or trywireline.com; never promise human follow-up from a demo line.",
    );
  }

  const forbidden = FORBIDDEN_SHOWCASE_CLAIMS.find((claim) => prompt.includes(claim));
  if (forbidden) {
    throw new Error(`Showcase prompt contains forbidden claim: ${forbidden}`);
  }
  if (kind === "demo" && /have someone follow up/i.test(prompt)) {
    throw new Error("Demo showcase prompt promises an unavailable human follow-up.");
  }

  promptRow.message.content = prompt;
  return payload;
}

function isShowcaseAssistantResponse(
  body: unknown,
): body is { assistant: ShowcaseAssistantPayload } {
  if (!body || typeof body !== "object") return false;
  const assistant = (body as { assistant?: unknown }).assistant;
  if (!assistant || typeof assistant !== "object") return false;
  const typed = assistant as ShowcaseAssistantPayload;
  const row = systemPrompt(typed);
  return Boolean(
    (row && SHOWCASE_PROMPT_MARKERS.some((marker) => row.content.includes(marker))) ||
      isCapacityAssistant(typed),
  );
}

export function showcasePromptTruthGuard(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!isShowcaseAssistantResponse(body)) return originalJson(body);
    try {
      sanitizeShowcaseAssistantPayload(body.assistant);
      return originalJson(body);
    } catch (error) {
      console.error("Showcase prompt truth guard rejected assistant payload", {
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500);
      return originalJson({
        code: "SHOWCASE_PROMPT_REJECTED",
        error: `The public assistant configuration did not pass ${BOTBOUND_BRAND_NAME}'s truth checks.`,
      });
    }
  }) as Response["json"];
  next();
}
