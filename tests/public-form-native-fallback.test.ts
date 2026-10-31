import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("public form native-submission privacy", () => {
  it.each([
    "src/components/auth/AuthAccessPanel.tsx",
    "src/pages/ResetPassword.tsx",
    "src/components/ContactPage.tsx",
    "src/components/SupportPage.tsx",
  ])("never falls back to a GET request containing user input in %s", (path) => {
    const source = read(path);
    const forms = [...source.matchAll(/<form\b[^>]*>/g)].map(([form]) => form);
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(form).toContain('method="post"');
      expect(form).toMatch(/\bonSubmit=\{/);
    }
  });
});
