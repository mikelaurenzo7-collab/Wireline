import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isSavedRuntimeReviewRequired,
  removesRegulatedTemplateProvenance,
  RUNTIME_REVIEW_REQUIRED_GREETING,
  RUNTIME_REVIEW_REQUIRED_RESPONSE,
} from "../src/lib/runtime-template-personality";
import { TEMPLATE_OVERLAYS } from "../src/lib/template-overlays";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("regulated runtime hold", () => {
  it("recognizes regulated template provenance and the generic collections role", () => {
    expect(isSavedRuntimeReviewRequired(TEMPLATE_OVERLAYS["scheduler-medical"], "scheduler")).toBe(
      true,
    );
    expect(isSavedRuntimeReviewRequired("ordinary personality", "collections")).toBe(true);
    expect(isSavedRuntimeReviewRequired("ordinary personality", "customer_service")).toBe(false);
  });

  it("uses neutral copy that does not solicit regulated data", () => {
    for (const copy of [RUNTIME_REVIEW_REQUIRED_GREETING, RUNTIME_REVIEW_REQUIRED_RESPONSE]) {
      expect(copy).toContain("review");
      expect(copy).not.toMatch(/patient name|account number|balance due|insurance id/i);
    }
    expect(RUNTIME_REVIEW_REQUIRED_RESPONSE).toContain("No customer details were sent");
  });

  it("prevents Training, web, and mobile writes from erasing regulated provenance", () => {
    const medical = TEMPLATE_OVERLAYS["scheduler-medical"];
    const ordinary = TEMPLATE_OVERLAYS["support-tier1"];

    expect(removesRegulatedTemplateProvenance(medical, ordinary)).toBe(true);
    expect(removesRegulatedTemplateProvenance(medical, medical)).toBe(false);
    expect(removesRegulatedTemplateProvenance(ordinary, "Updated ordinary guidance")).toBe(false);

    const webRoutes = source("../src/routes/agent-routes-v2.ts");
    expect(webRoutes.match(/removesRegulatedTemplateProvenance\(/g)).toHaveLength(2);
    expect(webRoutes.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(2);
    expect(webRoutes).toContain("REGULATED_TEMPLATE_PROVENANCE_PROTECTED");

    const mobileRoutes = source("../src/routes/mobile-routes.ts");
    expect(mobileRoutes).toContain("removesRegulatedTemplateProvenance(current?.content, content)");
    expect(mobileRoutes).toContain("FOR UPDATE");
    expect(mobileRoutes).toContain("REGULATED_TEMPLATE_PROVENANCE_PROTECTED");
  });

  it("removes tools and saved greetings from every live voice provider", () => {
    const vapi = source("../src/lib/vapi-assistant-factory-v2.ts");
    expect(vapi).toContain("const functionTools = reviewRequired");
    expect(vapi).toMatch(/reviewRequired\s*\? \[\]/);
    expect(vapi).toContain("? RUNTIME_REVIEW_REQUIRED_GREETING");

    const openai = source("../src/lib/voice/openai-live-agent-service.ts");
    expect(openai).toContain("tools: reviewRequired ? [] : LIVE_DEMO_TOOLS");
    expect(openai).toContain('tool_choice: reviewRequired ? "none" : "auto"');
    expect(openai).toContain("? RUNTIME_REVIEW_REQUIRED_GREETING");
    expect(openai).toContain("tools: reviewRequired ? [] : LIVE_DEMO_TOOLS.map");

    const xai = source("../src/lib/voice/xai-agent-runtime.ts");
    expect(xai).toContain("isSavedRuntimeReviewRequired(runtime.personality");
    expect(xai).toContain('reviewRequired ? "none" : "auto"');
    expect(xai).toContain("? RUNTIME_REVIEW_REQUIRED_GREETING");
  });

  it("refuses regulated live sessions before any provider call is created", () => {
    const openai = source("../src/lib/voice/openai-live-agent-service.ts");
    const openaiGuard = openai.indexOf('throw new AppError(409, "RUNTIME_REVIEW_REQUIRED"');
    expect(openaiGuard).toBeGreaterThan(-1);
    expect(openaiGuard).toBeLessThan(
      openai.indexOf("await createServerManagedOpenAIRealtimeCall({"),
    );

    const xai = source("../src/lib/voice/xai-agent-runtime.ts");
    expect(xai).toContain('throw new AppError(409, "RUNTIME_REVIEW_REQUIRED"');

    const xaiWebhook = source("../src/routes/xai-voice-routes.ts");
    const xaiWebhookGuard = xaiWebhook.indexOf("if (agentContext.reviewRequired)");
    expect(xaiWebhookGuard).toBeGreaterThan(-1);
    expect(xaiWebhookGuard).toBeLessThan(
      xaiWebhook.indexOf("const sessionLease = await acquireAccountOperationLease"),
    );
    expect(xaiWebhook.slice(xaiWebhookGuard, xaiWebhookGuard + 1_200)).toContain(
      "await hangupXAISipCall(callId)",
    );

    const xaiActivation = source("../src/lib/voice/xai-phone-activation-service.ts");
    const activationGuard = xaiActivation.lastIndexOf("isSavedRuntimeReviewRequired(");
    expect(activationGuard).toBeGreaterThan(-1);
    expect(activationGuard).toBeLessThan(
      xaiActivation.indexOf("await assertLiveExternalActionAllowed", activationGuard),
    );

    const studioVapi = source("../src/lib/voice/studio-vapi-web-session.ts");
    const studioGuard = studioVapi.indexOf("if (isSavedRuntimeReviewRequired");
    expect(studioGuard).toBeGreaterThan(-1);
    expect(studioGuard).toBeLessThan(studioVapi.indexOf('fetch("https://api.vapi.ai/call/web"'));

    const vapiRoute = source("../src/routes/vapi-v2.ts");
    const pstnGuard = vapiRoute.indexOf("isSavedRuntimeReviewRequired(");
    expect(pstnGuard).toBeGreaterThan(-1);
    expect(pstnGuard).toBeLessThan(vapiRoute.indexOf("await buildVapiAssistant({"));
  });

  it("returns a neutral hold before either structured rehearsal invokes a provider", () => {
    const privateTest = source("../src/lib/private-agent-test.ts");
    expect(privateTest.indexOf("if (context.reviewRequired)")).toBeGreaterThan(-1);
    expect(privateTest.indexOf("if (context.reviewRequired)")).toBeLessThan(
      privateTest.indexOf("await runStructured<"),
    );

    const studioTest = source("../src/routes/agent-test-routes.ts");
    expect(studioTest.indexOf("if (isSavedRuntimeReviewRequired")).toBeGreaterThan(-1);
    expect(studioTest.indexOf("if (isSavedRuntimeReviewRequired")).toBeLessThan(
      studioTest.indexOf("await runStructuredStream<"),
    );
    expect(studioTest).toContain("RUNTIME_REVIEW_REQUIRED_RESPONSE");
  });
});
