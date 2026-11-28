import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BO_BUSINESS_MAX_CHARS,
  clearBoOnboarding,
  isPersonalStarter,
  mergeCheckFirst,
  normalizeWebsiteUrl,
  readBoOnboarding,
  splitCheckFirst,
  writeBoOnboarding,
} from "../src/lib/bo-onboarding";
import { PLAYBOOK_LIMITS } from "../src/lib/agent-playbook";
import { BO_ONBOARDING_COPY, FIRST_BOT_NAME } from "../src/lib/wireline-onboarding-copy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
});

describe("Bo's first conversation: state", () => {
  it("keeps only the Bot, the step and the business line, per account", () => {
    writeBoOnboarding("owner-a", {
      agentId: "bot-1",
      step: "website",
      business: "Rivera Plumbing",
    });
    expect(readBoOnboarding("owner-a")).toEqual({
      agentId: "bot-1",
      step: "website",
      business: "Rivera Plumbing",
    });
    expect(readBoOnboarding("owner-b")).toBeNull();
    expect(readBoOnboarding(null)).toBeNull();
    clearBoOnboarding("owner-a");
    expect(readBoOnboarding("owner-a")).toBeNull();
  });

  it("ignores a stored step it does not know and bounds the business line", () => {
    sessionStorage.setItem(
      "wireline:bo-onboarding:v1:owner-a",
      JSON.stringify({ agentId: "bot-1", step: "voice" }),
    );
    expect(readBoOnboarding("owner-a")).toBeNull();
    sessionStorage.setItem(
      "wireline:bo-onboarding:v1:owner-a",
      JSON.stringify({ agentId: "bot-1", step: "about", business: "x".repeat(2000) }),
    );
    expect(readBoOnboarding("owner-a")?.business).toHaveLength(BO_BUSINESS_MAX_CHARS);
    sessionStorage.setItem("wireline:bo-onboarding:v1:owner-a", "{not json");
    expect(readBoOnboarding("owner-a")).toBeNull();
  });
});

describe("Bo's first conversation: answers", () => {
  it("reads a website from what owners actually type", () => {
    expect(normalizeWebsiteUrl("riveraplumbing.com")).toBe("https://riveraplumbing.com/");
    expect(normalizeWebsiteUrl(" https://rivera.co/about ")).toBe("https://rivera.co/about");
    expect(normalizeWebsiteUrl("http://rivera.co")).toBe("https://rivera.co/");
    for (const bad of [
      "",
      "rivera plumbing",
      "localhost",
      "ftp://rivera.co",
      "https://user:pass@rivera.co",
      "javascript:alert(1)",
    ]) {
      expect(normalizeWebsiteUrl(bad), bad).toBeNull();
    }
  });

  it("turns check-first answers into Playbook items, one per line or semicolon", () => {
    expect(
      splitCheckFirst("- Discounts or refunds\n2. Jobs outside our area; promising same-day\n\n"),
    ).toEqual(["Discounts or refunds", "Jobs outside our area", "promising same-day"]);
    expect(splitCheckFirst("Refunds\nrefunds\n • Refunds ")).toEqual(["Refunds"]);
    const many = Array.from({ length: 30 }, (_, index) => `Item ${index}`).join("\n");
    expect(splitCheckFirst(many)).toHaveLength(PLAYBOOK_LIMITS.checkFirst);
    expect(splitCheckFirst("y".repeat(500))[0]).toHaveLength(PLAYBOOK_LIMITS.itemChars);
  });

  it("adds check-first items after the saved ones without repeats", () => {
    expect(mergeCheckFirst(["Refunds"], ["refunds", "Discounts"])).toEqual([
      "Refunds",
      "Discounts",
    ]);
    const saved = Array.from({ length: 9 }, (_, index) => `Saved ${index}`);
    expect(mergeCheckFirst(saved, ["New 1", "New 2"])).toEqual([...saved, "New 1"]);
  });

  it("starts a personal assistant only from a personal starter link", () => {
    expect(isPersonalStarter("personal-assistant")).toBe(true);
    expect(isPersonalStarter(null, "family-concierge")).toBe(true);
    expect(isPersonalStarter("front-desk", undefined)).toBe(false);
    expect(isPersonalStarter()).toBe(false);
  });
});

describe("Bo's first conversation: product contract", () => {
  const onboarding = read("src/components/onboarding/BoOnboarding.tsx");

  it("creates Bo once, asks four questions, and saves through existing routes", () => {
    expect(FIRST_BOT_NAME).toBe("Bo");
    expect(onboarding).toContain("only_if_none: true");
    expect(onboarding).toContain('authFetch("/api/train/extract"');
    expect(onboarding).toContain("/website`");
    expect(onboarding).toContain("/web-lookup`");
    expect(onboarding).toContain("/playbook`");
    expect(onboarding).toContain("mergeCheckFirst(saved, items)");
    for (const question of [
      BO_ONBOARDING_COPY.about.question,
      BO_ONBOARDING_COPY.website.question,
      BO_ONBOARDING_COPY.questions.question,
      BO_ONBOARDING_COPY.checks.question,
    ]) {
      expect(question.endsWith("?") || question.endsWith(".")).toBe(true);
    }
  });

  it("ends on hearing Bo, its voice and going live, and never asks for a plan sooner", () => {
    expect(onboarding).toContain("`/studio?agent=${id}&workroom=test`");
    expect(onboarding).toContain("`/studio?agent=${id}&section=setup#voice`");
    expect(onboarding).toContain(
      'access.includes("voice") ? `/phone?tab=lines&agent=${id}` : choosePlanHref()',
    );
    expect(onboarding.match(/choosePlanHref\(\)/g)).toHaveLength(1);
  });

  it("keeps a lookup result out of Knowledge until the owner confirms it", () => {
    const lookUp = onboarding.slice(onboarding.indexOf("function lookUp()"));
    const lookUpBody = lookUp.slice(0, lookUp.indexOf("function confirmLookup("));
    expect(lookUpBody).not.toContain("teach(");
    const confirm = onboarding.slice(onboarding.indexOf("function confirmLookup("));
    expect(confirm.indexOf("if (!yes || !lookup)")).toBeLessThan(confirm.indexOf("teach("));
  });

  it("reports nothing for a reply that lands after the owner signed out", () => {
    const teach = onboarding.slice(onboarding.indexOf("async function teach("));
    const body = teach.slice(0, teach.indexOf("async function run("));
    const guard = body.indexOf("if (!current()) return null;");
    expect(guard).toBeGreaterThan(body.indexOf("await safeJson(response)"));
    expect(guard).toBeLessThan(body.indexOf('event: "training_asset_added"'));
    expect(guard).toBeLessThan(body.indexOf('event: "launch_readiness_reached"'));
  });

  it("lets the server, under the account lock, hand back the existing Bot instead of a second Bo", () => {
    const routes = read("src/routes/agent-routes-v2.ts");
    const create = routes.slice(
      routes.indexOf("const onlyIfNone = req.body?.only_if_none === true;"),
    );
    const lock = create.indexOf("pg_advisory_xact_lock(hashtext(${req.user.id}))");
    const reuse = create.indexOf("if (onlyIfNone && existing > 0) {");
    const insert = create.indexOf("await tx.insert(schema.agents)");
    expect(lock).toBeGreaterThan(-1);
    expect(reuse).toBeGreaterThan(lock);
    expect(insert).toBeGreaterThan(reuse);
    expect(create).toContain("created: false,");
    expect(create).toContain('source: onlyIfNone ? "bo_onboarding" : "web_fast_start"');
  });
});
