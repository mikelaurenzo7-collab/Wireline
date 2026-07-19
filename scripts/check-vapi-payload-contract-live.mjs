#!/usr/bin/env node

/**
 * Non-billable live contract audit for Vapi's transient assistant payload.
 * Creates one inert assistant, verifies the current model.tools + server shape,
 * and always deletes it. It never places a call or sends a message.
 */

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

async function request(path, init = {}) {
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
        provider: "openai",
        model: "gpt-4o",
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
    console.error(`Vapi rejected the current assistant payload (HTTP ${response.status}).`);
    process.exitCode = 1;
  } else {
    const assistant = await response.json();
    assistantId = String(assistant?.id || "");
    if (!assistantId) {
      console.error("Vapi accepted the payload but returned no assistant id.");
      process.exitCode = 1;
    } else {
      console.log("Vapi accepted current model.tools, nested server auth, and Vapi Voice v2.");
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
