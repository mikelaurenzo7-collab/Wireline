import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const PUBLIC_FOUNDER_SURFACES = [
  "src/components/marketing/WireAgentLanding.tsx",
  "src/pages/Showcase.tsx",
  "src/pages/SolutionsPage.tsx",
  "src/components/SupportPage.tsx",
  "src/components/ContactPage.tsx",
  "src/components/layout/NotFound.tsx",
] as const;

describe("product-first founder PSTN retirement", () => {
  it("publishes browser demos without founder phone links", () => {
    for (const path of PUBLIC_FOUNDER_SURFACES) {
      const source = read(path);
      expect(source, path).not.toMatch(/href=\{?`?tel:/i);
      expect(source, path).not.toContain("+16306425661");
      expect(source, path).not.toContain("(630) 642-5661");
    }

    const showcase = read("src/pages/Showcase.tsx");
    expect(showcase).toContain("BrowserCallWidget");
    expect(showcase).toContain("Protected browser demos use OpenAI Realtime");
  });

  it("defaults transactional email to the canonical BotBound domain", () => {
    const resend = read("src/lib/resend-config.ts");
    expect(resend).toContain('const DEFAULT_DOMAIN = "botbound.me"');
    expect(resend).toContain("BotBound <noreply@");
    expect(resend).not.toContain('const DEFAULT_DOMAIN = "trywireline.com"');
  });

  it("ships an idempotent, tenant-scoped founder cleanup operation", () => {
    const operation = read("scripts/operations/retire-founder-vapi-bindings.sql");
    expect(operation).toContain("lower('mikelaurenzo7@gmail.com')");
    expect(operation).toContain("delete from public.wireline_phone_numbers");
    expect(operation).toContain("vapi_private_key = null");
    expect(operation).toContain("public_phone_number");
    expect(operation).toContain("begin;");
    expect(operation).toContain("commit;");
    expect(operation).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it("does not put one-workspace cleanup into the product migration journal", () => {
    const journal = read("drizzle/migrations/meta/_journal.json");
    expect(journal).not.toContain("retire_founder_vapi");
  });
});
