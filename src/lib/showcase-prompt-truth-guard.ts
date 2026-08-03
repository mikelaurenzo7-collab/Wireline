import type { NextFunction, Request, Response } from "express";

import { log } from "./server-context";

export type ShowcasePromptKind = "cs" | "demo";

type VapiMessage = {
  role?: string;
  content?: unknown;
};

type ShowcaseAssistantPayload = {
  model?: {
    messages?: VapiMessage[];
  };
};

const SHOWCASE_PROMPT_MARKERS = [
  "showcase demo built by Wireline",
  "a real Wireline employee on a real Wireline line",
] as const;

const FORBIDDEN_SHOWCASE_CLAIMS = [
  "auditor engaged",
  "target Q4 2026",
  "on request (~30 day onboarding)",
  "14-day free trial",
  "Personal $49",
  "Starter $149",
  "Pro $499",
  "Business $1,499",
] as const;

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
  if (prompt.includes("showcase demo built by Wireline")) return "demo";
  if (prompt.includes("a real Wireline employee on a real Wireline line")) return "cs";
  return null;
}

function replaceLiteral(source: string, from: string, to: string): string {
  return source.includes(from) ? source.split(from).join(to) : source;
}

/**
 * Last-mile guard for public Vapi prompts.
 *
 * Public assistants are long-lived provider objects and can outlive a code
 * deployment. This guard keeps both dynamic assistant responses and the
 * provider-sync script from re-publishing unverified compliance schedules,
 * unconditional connector promises, or demo-only follow-up claims.
 */
export function sanitizeShowcaseAssistantPayload<T extends ShowcaseAssistantPayload>(payload: T): T {
  const promptRow = systemPrompt(payload);
  if (!promptRow) return payload;

  const kind = showcaseKind(promptRow.content);
  if (!kind) return payload;

  let prompt = promptRow.content;
  prompt = replaceLiteral(
    prompt,
    "SOC 2 Type II - auditor engaged, target Q4 2026",
    "SOC 2 readiness work is in progress; Wireline is not SOC 2 certified today",
  );
  prompt = replaceLiteral(
    prompt,
    "HIPAA BAA - Enterprise tier only, on request (~30 day onboarding)",
    "HIPAA and BAA support are not currently available; do not present Wireline as HIPAA-certified",
  );
  prompt = replaceLiteral(
    prompt,
    "Authoritative, calm, HIPAA-aware tone",
    "Authoritative, calm, privacy-conscious administrative tone",
  );
  prompt = replaceLiteral(
    prompt,
    "If asked about HIPAA: Wireline is not HIPAA-certified today; BAA is on the Enterprise roadmap — say that plainly.",
    "If asked about HIPAA: Wireline is not HIPAA-certified and BAA support is not currently available — say that plainly.",
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
  if (kind === "demo" && /have someone follow up|someone will reach out/i.test(prompt)) {
    throw new Error("Demo showcase prompt promises an unavailable human follow-up.");
  }

  promptRow.message.content = prompt;
  return payload;
}

function isShowcaseAssistantResponse(body: unknown): body is { assistant: ShowcaseAssistantPayload } {
  if (!body || typeof body !== "object") return false;
  const assistant = (body as { assistant?: unknown }).assistant;
  if (!assistant || typeof assistant !== "object") return false;
  const row = systemPrompt(assistant as ShowcaseAssistantPayload);
  return Boolean(row && SHOWCASE_PROMPT_MARKERS.some((marker) => row.content.includes(marker)));
}

/** Apply the same truth guard to dynamic /api/vapi-webhook assistant responses. */
export function showcasePromptTruthGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (!isShowcaseAssistantResponse(body)) return originalJson(body);
    try {
      sanitizeShowcaseAssistantPayload(body.assistant);
      return originalJson(body);
    } catch (error) {
      log.error("Showcase prompt truth guard rejected assistant payload", {
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500);
      return originalJson({
        code: "SHOWCASE_PROMPT_REJECTED",
        error: "The public assistant configuration did not pass Wireline's truth checks.",
      });
    }
  }) as Response["json"];
  next();
}
