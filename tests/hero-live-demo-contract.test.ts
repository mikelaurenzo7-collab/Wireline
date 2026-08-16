import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_NAMES } from "../src/lib/product-events";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * The homepage may prove the voice product live, but only through the protected
 * proxy. No phone number, public Vapi authorization, or unbounded transient
 * assistant may return to the top of funnel.
 */
describe("homepage protected live voice proof", () => {
  it("keeps the live interaction inside the singular product theater", () => {
    const landing = read("src/components/marketing/WireAgentLanding.tsx");

    expect(landing).toContain("useProtectedPublicDemo");
    expect(landing).toContain("Talk Live");
    expect(landing).toContain("wireline-device__demo-control");
    expect(landing).not.toContain("<BrowserCallWidget");
    expect(landing).not.toContain("LANDING_PUBLIC_DEMO_AGENTS");
    expect(landing).not.toContain("href={`tel:");
  });

  it("routes browser calls through one-use, server-authorized spend controls", () => {
    const hook = read("src/hooks/useProtectedPublicDemo.ts");
    const routes = read("src/routes/marketing-runtime-routes.ts");
    const budget = read("src/lib/public-demo-budget.ts");

    expect(hook).toContain('fetch("/api/public/demo-session"');
    expect(hook).toContain("new VapiSDK(token, absoluteProxyUrl)");
    expect(routes).toContain('router.post("/api/public/demo-vapi/call/web"');
    expect(routes).toContain("process.env.VAPI_PRIVATE_KEY");
    expect(routes).toContain("maxDurationSeconds: PUBLIC_DEMO_MAX_DURATION_SECONDS");
    expect(budget).toContain("PUBLIC_DEMO_MAX_DURATION_SECONDS = 45");
    expect(budget).toContain("failClosedOnError: true");
  });

  it("keeps top-of-funnel live-demo intent measurable", () => {
    const hook = read("src/hooks/useProtectedPublicDemo.ts");

    expect(PRODUCT_EVENT_NAMES).toContain("landing_demo_clicked");
    expect(hook).toContain('event: "landing_demo_clicked"');
    expect(hook).toContain('mode: "protected_browser_voice"');
  });
});
