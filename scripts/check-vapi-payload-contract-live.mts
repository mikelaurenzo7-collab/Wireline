#!/usr/bin/env node

/**
 * Non-billable live contract audit for Wireline's transient Vapi assistant.
 *
 * Creates one inert assistant using the exact managed xAI Grok 4.3 policy,
 * reads the saved configuration back, and always deletes it. It never
 * places a call, creates a chat, or generates model output.
 *
 * Vapi's XaiModel DTO rejects `fallbackModels`. Continuity is Wireline's
 * application retry to OpenAI after a definitive model/provider rejection.
 */
import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
} from "../src/lib/ai-models";

const key = process.env.VAPI_PRIVATE_KEY?.trim();
const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
if (!key || !secret) {
  console.error("Vapi schema audit requires VAPI_PRIVATE_KEY and VAPI_WEBHOOK_SECRET.");
  process.exit(1);
}

const baseUrl = "https://api.vapi.ai";
const headers = {
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};
let assistantId = "";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
    signal: AbortSignal.timeout(15_000),
  });
}

try {
  const response = await request("/assistant", {
    method: "POST",
    body: JSON.stringify({
      name: "Wireline Launch Schema Probe",
      firstMessage: "This assistant is an inert configuration probe.",
      model: {
        provider: VAPI_TENANT_DEFAULT_PROVIDER,
        model: VAPI_TENANT_DEFAULT_MODEL,
        systemPrompt: "Never place or answer a call. This assistant validates configuration only.",
        tools: [
          {
            type: "function",
            function: {
              name: "wireline_schema_probe",
              description: "Validate the current Vapi function-tool payload.",
              parameters: {
                type: "object",
                properties: {
                  value: { type: "string" },
                },
                required: ["value"],
              },
            },
          },
        ],
      },
      server: {
        url: "https://trywireline.com/api/vapi-webhook",
        secret,
      },
      voice: {
        provider: "vapi",
        voiceId: "Elliot",
        version: 2,
      },
      serverMessages: ["tool-calls", "status-update", "end-of-call-report"],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(
      `Vapi rejected the managed assistant policy (HTTP ${response.status}): ${body.slice(0, 500)}`,
    );
    process.exitCode = 1;
  } else {
    const assistant = (await response.json()) as {
      id?: string;
      model?: { provider?: string; model?: string; fallbackModels?: string[] };
    };
    assistantId = String(assistant?.id || "");
    if (!assistantId) {
      console.error("Vapi accepted the payload but returned no assistant id.");
      process.exitCode = 1;
    } else {
      const readBack = await request(`/assistant/${encodeURIComponent(assistantId)}`);
      if (!readBack.ok) {
        console.error(`Vapi could not read back the inert assistant (HTTP ${readBack.status}).`);
        process.exitCode = 1;
      } else {
        const saved = (await readBack.json()) as {
          model?: { provider?: string; model?: string; fallbackModels?: string[] };
        };
        const model = saved.model;
        const exact =
          model?.provider === VAPI_TENANT_DEFAULT_PROVIDER &&
          model?.model === VAPI_TENANT_DEFAULT_MODEL &&
          (model?.fallbackModels == null ||
            (Array.isArray(model.fallbackModels) && model.fallbackModels.length === 0));
        if (!exact) {
          console.error("Vapi changed or omitted the managed xAI Grok 4.3 model policy.");
          process.exitCode = 1;
        } else {
          console.log(
            `Vapi certified ${VAPI_TENANT_DEFAULT_PROVIDER}/${VAPI_TENANT_DEFAULT_MODEL} without XaiModel fallbackModels.`,
          );
        }
      }
    }
  }
} finally {
  if (assistantId) {
    const cleanup = await request(`/assistant/${encodeURIComponent(assistantId)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (!cleanup?.ok) {
      console.error("Vapi schema probe cleanup failed; remove the inert assistant manually.");
      process.exitCode = 1;
    } else {
      console.log("Vapi schema probe cleanup completed.");
    }
  }
}
