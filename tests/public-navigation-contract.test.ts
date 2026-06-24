import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public navigation mobile regression contract", () => {
  it("keeps the public header on the portal-backed dialog primitive", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).toContain("DialogContent");
    expect(header).toContain("DialogTrigger");
    expect(header).toContain("DialogClose");
    expect(header).toContain('presentation="navigation"');
    expect(header).toContain("showClose={false}");
    expect(header).toContain('id="wireline-mobile-navigation"');
    expect(header).not.toContain("document.body.style.overflow");
    expect(header).not.toContain("querySelector<HTMLElement>");
  });

  it("keeps all primary navigation and account actions visible in the mobile dialog", () => {
    const header = source("src/components/marketing/PrecisionPublicHeader.tsx");

    expect(header).toContain('label: "Product"');
    expect(header).toContain('label: "Features"');
    expect(header).toContain('label: "Pricing"');
    expect(header).toContain('to="/signin"');
    expect(header).toContain('to="/signup"');
    expect(header).toContain("Create your assistant");
  });

  it("keeps skip navigation visually hidden until keyboard focus", () => {
    const foundation = source("src/styles/foundation.css");

    expect(foundation).toContain(".wl-skip-link {");
    expect(foundation).toContain("transform: translateY(calc(-100% - 1.5rem))");
    expect(foundation).toContain(".wl-skip-link:focus-visible");
    expect(foundation).toContain("transform: translateY(0)");
  });

  it("keeps Dialog capable of route-safe overlay, close-control, and navigation composition", () => {
    const dialog = source("src/components/atoms/Dialog.tsx");

    expect(dialog).toContain("dialogContentVariants = cva");
    expect(dialog).toContain("presentation: {");
    expect(dialog).toContain("navigation:");
    expect(dialog).toContain("overlayClassName?: string");
    expect(dialog).toContain("showClose?: boolean");
    expect(dialog).toContain('data-slot="dialog-overlay"');
    expect(dialog).toContain("DialogPortal");
  });
});
