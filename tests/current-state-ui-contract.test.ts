import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CLIENT_SURFACE_POSTURE, PRODUCT_POSTURE } from "../src/lib/product-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("current-state UI contract", () => {
  it("keeps authenticated product headers start-aligned and wrap-safe", () => {
    const frame = read("src/components/layout/WorkspacePageFrame.tsx");
    const signature = read("src/styles/wireline-app-signature.css");

    expect(frame).toContain("data-align={align}");
    expect(frame).toContain("break-words text-balance");
    expect(signature).toContain('.wl-workspace-page-intro[data-align="start"]');
    expect(signature).toContain("justify-content: flex-start");
    expect(signature).toContain("text-overflow: clip");
    expect(signature).toContain('[data-wireline-route="/studio"]');
  });

  it("keeps companion availability honest to the web-first launch order", () => {
    const apps = read("src/pages/ClientAppsPage.tsx");

    expect(CLIENT_SURFACE_POSTURE.summary).toContain("Web is the canonical runtime");
    expect(CLIENT_SURFACE_POSTURE.browser.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.chatgpt.status).toBe("Early access");
    expect(CLIENT_SURFACE_POSTURE.android.status).toBe("Internal beta");
    expect(CLIENT_SURFACE_POSTURE.ios.status).toBe("Planned");
    expect(apps).toContain("CLIENT_SURFACE_POSTURE");
    expect(apps).not.toContain('status: "Live"');
    expect(apps).not.toContain('action: "TestFlight"');
  });

  it("uses direction and guardrails for product control without weakening legal consent copy", () => {
    const copy = read("src/lib/product-copy.ts");

    expect(copy).toContain("under the owner's direction");
    expect(copy).toContain("under your direction");
    expect(PRODUCT_POSTURE.personal.emptyBody).toBe(
      "Your calls. Your direction. Your outcomes.",
    );
    expect(copy).toContain("guardrails, approvals, spend, handoffs, and escalation");
    expect(copy).not.toContain("under the owner's rules");
    expect(copy).toContain("consent rules");
  });
});
