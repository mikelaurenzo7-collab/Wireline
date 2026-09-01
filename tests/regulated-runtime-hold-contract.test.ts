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

  it("checks the review hold before either OpenAI live session is constructed", () => {
    for (const [path, sessionMarker] of [
      ["../src/lib/voice/openai-phone-agent-runtime.ts", "const commonSession ="],
      ["../src/lib/voice/openai-live-agent-service.ts", "const session ="],
    ] as const) {
      const runtime = source(path);
      const guard = runtime.indexOf('throw new AppError(409, "RUNTIME_REVIEW_REQUIRED"');
      expect(guard, path).toBeGreaterThan(-1);
      expect(guard, path).toBeLessThan(runtime.indexOf(sessionMarker, guard));
    }
  });

  it("refuses regulated live sessions before any provider call is created", () => {
    const openai = source("../src/lib/voice/openai-live-agent-service.ts");
    const openaiGuard = openai.indexOf('throw new AppError(409, "RUNTIME_REVIEW_REQUIRED"');
    expect(openaiGuard).toBeGreaterThan(-1);
    expect(openaiGuard).toBeLessThan(
      openai.indexOf("await createServerManagedOpenAIRealtimeCall({"),
    );

    const phoneRuntime = source("../src/lib/voice/openai-phone-agent-runtime.ts");
    const phoneGuard = phoneRuntime.indexOf('throw new AppError(409, "RUNTIME_REVIEW_REQUIRED"');
    expect(phoneGuard).toBeGreaterThan(-1);
    expect(phoneGuard).toBeLessThan(phoneRuntime.indexOf("const commonSession =", phoneGuard));

    const sipRoute = source("../src/routes/openai-sip-routes.ts");
    const runtimeBuild = sipRoute.indexOf("await buildOpenAIRealtimeAgentRuntime({");
    const reject = sipRoute.indexOf("await rejectCall(callId, 603)", runtimeBuild);
    const lease = sipRoute.indexOf("await acquireAccountOperationLease({", runtimeBuild);
    const accept = sipRoute.indexOf("await acceptCall(callId", runtimeBuild);
    expect(runtimeBuild).toBeGreaterThan(-1);
    expect(reject).toBeGreaterThan(runtimeBuild);
    expect(lease).toBeGreaterThan(reject);
    expect(accept).toBeGreaterThan(lease);
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
