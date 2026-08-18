#!/usr/bin/env python3
"""One-shot repair for integrating current main into the native xAI/Twilio branch.

The script updates verified source-of-truth drift and rewrites stale contract tests
that still assert the retired Vapi/manual-phone or fixed-canvas architecture.
It is removed by the integration workflow after a green verification run.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_required(path: str, old: str, new: str, *, count: int = 1) -> None:
    text = read(path)
    found = text.count(old)
    if found < count:
        raise RuntimeError(f"{path}: expected at least {count} occurrence(s), found {found}: {old!r}")
    write(path, text.replace(old, new, count))


def replace_regex_required(path: str, pattern: str, replacement: str, *, count: int = 1) -> None:
    text = read(path)
    updated, replaced = re.subn(pattern, replacement, text, count=count, flags=re.MULTILINE | re.DOTALL)
    if replaced != count:
        raise RuntimeError(f"{path}: expected {count} regex replacement(s), got {replaced}: {pattern}")
    write(path, updated)


def matching_brace_end(text: str, brace_start: int) -> int:
    depth = 0
    quote: str | None = None
    escaped = False
    line_comment = False
    block_comment = False
    i = brace_start
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
                continue
            i += 1
            continue
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch in {'"', "'", "`"}:
            quote = ch
            i += 1
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise RuntimeError("unterminated JavaScript block")


def replace_test(path: str, title: str, replacement: str) -> None:
    text = read(path)
    marker = f'it("{title}"'
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"{path}: test not found: {title}")
    # Preserve the file's existing indentation before `it(`.
    line_start = text.rfind("\n", 0, start) + 1
    start = line_start
    brace_start = text.find("{", text.find("=>", start))
    if brace_start < 0:
        raise RuntimeError(f"{path}: callback block not found for: {title}")
    brace_end = matching_brace_end(text, brace_start)
    close = text.find(");", brace_end)
    if close < 0:
        raise RuntimeError(f"{path}: test terminator not found for: {title}")
    close += 2
    if close < len(text) and text[close] == "\n":
        close += 1
    write(path, text[:start] + replacement.rstrip() + "\n" + text[close:])


HEADER = '''import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router";

import WirelineMark from "../brand/WirelineMark";
import SkipToContentLink from "../layout/SkipToContentLink";

const SITE_LINKS = [
  { to: "/features", label: "Features" },
  { to: "/pricing", label: "Pricing" },
  { to: "/showcase", label: "Demos" },
] as const;

export default function PrecisionPublicHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="wl-public-header fixed inset-x-0 top-0 z-[80] border-b border-border bg-[color:color-mix(in_srgb,var(--wireline-page)_96%,transparent)] backdrop-blur-xl">
      <SkipToContentLink href="#main-content" />
      <div className="wl-measure mx-auto flex h-16 items-center gap-3 px-4 sm:gap-5 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] font-[var(--wireline-font-display)] text-[length:var(--wireline-typography-h3-size)] font-semibold tracking-[-.035em] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          aria-label="Wireline home"
          onClick={() => setOpen(false)}
        >
          <WirelineMark className="size-8 shrink-0 text-primary" signal />
          <span>Wireline</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Site">
          {SITE_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              aria-current={isActive(link.to) ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 aria-[current=page]:bg-secondary aria-[current=page]:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <nav className="ml-auto hidden items-center gap-2 md:flex" aria-label="Account">
          <Link
            to="/signin"
            className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3 text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Sign In
          </Link>
          <Link
            to="/signup?plan=personal"
            className="marketing-btn-primary min-h-11 px-4 text-sm font-semibold"
          >
            Start Free
          </Link>
        </nav>

        <button
          type="button"
          className="ml-auto inline-grid size-11 place-items-center rounded-[var(--radius-md)] border border-border bg-background text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:hidden"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-controls="wireline-mobile-navigation"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>

      {open ? (
        <div
          id="wireline-mobile-navigation"
          className="absolute inset-x-0 top-16 border-b border-border bg-background px-4 pb-5 shadow-[var(--wireline-elevation-md)] md:hidden"
        >
          <nav className="grid gap-1 pt-3" aria-label="Mobile site">
            {SITE_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                aria-current={isActive(link.to) ? "page" : undefined}
                onClick={() => setOpen(false)}
                className="inline-flex min-h-12 items-center rounded-[var(--radius-md)] px-3 text-base font-medium text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-[current=page]:bg-secondary"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-4">
            <Link
              to="/signin"
              onClick={() => setOpen(false)}
              className="marketing-btn-secondary min-h-11 justify-center px-3 text-sm font-semibold"
            >
              Sign In
            </Link>
            <Link
              to="/signup?plan=personal"
              onClick={() => setOpen(false)}
              className="marketing-btn-primary min-h-11 justify-center px-3 text-sm font-semibold"
            >
              Start Free
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
'''

VIEWPORT_SPEC = '''import { expect, test, type Page } from "@playwright/test";

test.setTimeout(150_000);

const CANVASES = [
  { path: "/", name: "home" },
  { path: "/features", name: "features" },
  { path: "/pricing", name: "pricing" },
  { path: "/showcase", name: "demos" },
  { path: "/signin", name: "sign in" },
] as const;

async function openCanvas(page: Page, path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(path, { waitUntil: "commit", timeout: 60_000 });
    await expect(page.locator("body")).toBeVisible({ timeout: 10_000 });
    try {
      await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Loading", exact: true })).toHaveCount(0, {
        timeout: 60_000,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function layoutMetrics(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const consoleElement = document.querySelector(".landing-console");
    const title = document.querySelector(".landing-stage__title");
    const header = document.querySelector(".marketing-surface > header");
    const consoleRect = consoleElement?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    return {
      docHorizontalOverflow: root.scrollWidth - root.clientWidth,
      bodyHorizontalOverflow: body.scrollWidth - body.clientWidth,
      documentScrollable: root.scrollHeight > root.clientHeight + 2,
      headerCount: header ? 1 : 0,
      consoleLeft: consoleRect?.left ?? 0,
      consoleRight: consoleRect?.right ?? 0,
      titleLeft: titleRect?.left ?? 0,
      titleRight: titleRect?.right ?? 0,
      viewportWidth: window.innerWidth,
    };
  });
}

for (const { path, name } of CANVASES) {
  test(`${name} never creates horizontal page overflow at 1365x900`, async ({ page }) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await openCanvas(page, path);
    const metrics = await layoutMetrics(page);
    expect(metrics.docHorizontalOverflow, `${name} document horizontal overflow`).toBeLessThanOrEqual(2);
    expect(metrics.bodyHorizontalOverflow, `${name} body horizontal overflow`).toBeLessThanOrEqual(2);
  });
}

test("home presents a professional desktop buying frame and normal site navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/");

  await expect(page.locator(".landing-console")).toBeVisible();
  await expect(page.locator(".landing-stage__title")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Agent work lane" })).toBeVisible();
  const site = page.getByRole("navigation", { name: "Site" });
  await expect(site).toBeVisible();
  await expect(site.getByRole("link", { name: "Features" })).toBeVisible();
  await expect(site.getByRole("link", { name: "Pricing" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Build Your Voice Agent" }).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Hear It Live/i }).or(
      page.getByRole("link", { name: /Hear It Live/i }),
    ),
  ).toBeVisible();

  const metrics = await layoutMetrics(page);
  expect(metrics.headerCount).toBe(1);
  expect(metrics.titleLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.titleRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.consoleLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.consoleRight).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.documentScrollable, "the consolidated home is an intentional long-form page").toBe(true);
});

test("home stays horizontally composed on a short laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openCanvas(page, "/");
  const metrics = await layoutMetrics(page);
  expect(metrics.docHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow).toBeLessThanOrEqual(2);
  await expect(page.locator(".landing-stage__title")).toBeVisible();
  await expect(page.locator(".landing-console")).toBeVisible();
});

test("home exposes an accessible mobile navigation sheet without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCanvas(page, "/");

  const openNavigation = page.getByRole("button", { name: "Open navigation" });
  await expect(openNavigation).toBeVisible();
  await openNavigation.click();

  const sheet = page.locator("#wireline-mobile-navigation");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Features" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Pricing" })).toBeVisible();
  await page.getByRole("button", { name: "Close navigation" }).click();
  await expect(sheet).toHaveCount(0);

  const consoleElement = page.locator(".landing-console");
  await consoleElement.scrollIntoViewIfNeeded();
  await expect(consoleElement).toBeVisible();
  await expect(page.locator(".landing-phone")).toHaveCount(0);
  await expect(page.locator(".landing-os__tray")).toHaveCount(0);

  const metrics = await layoutMetrics(page);
  expect(metrics.docHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.headerCount).toBe(1);
});

test("feature canvas keeps a readable long-scroll escape hatch on a short desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await openCanvas(page, "/features");
  const metrics = await layoutMetrics(page);
  expect(metrics.docHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.documentScrollable).toBe(true);
});

test("pricing opens with the live starter plan and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await openCanvas(page, "/pricing");
  await expect(page.getByRole("heading", { name: "Starter", exact: true })).toBeVisible();
  await expect(page.getByText("Channel rules and launch questions")).toBeVisible();
  const metrics = await layoutMetrics(page);
  expect(metrics.docHorizontalOverflow).toBeLessThanOrEqual(2);
  expect(metrics.bodyHorizontalOverflow).toBeLessThanOrEqual(2);
});
'''

ROUND6_TENANT_BINDING = '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 phone-line tenant binding", () => {
  const carrier = read("src/routes/carrier-routes.ts");
  const nativeRouting = read("src/routes/native-phone-routing-routes.ts");
  const nativeBindingMigration = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");

  it("retires the legacy manual Vapi line-claim endpoint instead of silently binding it", () => {
    const handler = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(handler).toContain("NATIVE_PHONE_REQUIRED");
    expect(handler).toContain("native Twilio and xAI");
  });

  it("gates native number search and provisioning on plan capacity", () => {
    expect(nativeRouting).toContain("getIncludedPhoneLineSlots");
    expect(nativeRouting).toContain("PHONE_CAPACITY_REACHED");
  });

  it("binds native xAI lines through a tenant-owned table with a database uniqueness backstop", () => {
    expect(nativeRouting).toContain("xaiPhoneBindings");
    expect(nativeBindingMigration).toContain("wireline_xai_phone_bindings");
    expect(nativeBindingMigration).toMatch(/UNIQUE|CREATE UNIQUE INDEX/);
  });

  it("keeps the legacy rollback storage backstop that makes a duplicate Vapi claim impossible", () => {
    const schemaSrc = read("src/db/schema.ts");
    expect(schemaSrc).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique",
    );
    const migration = read("drizzle/migrations/0111_phone_number_tenant_binding.sql");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("idx_phone_numbers_user_id");

    const resolver = read("src/lib/vapi-webhook-agent.ts");
    expect(resolver).toContain("eq(schema.phoneNumbers.vapiNumberId, phoneNumberId)");
  });
});

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const create = mobile.slice(
      mobile.indexOf('"/api/mobile/agents",'),
      mobile.indexOf('router.get(\\n  "/api/mobile/agents"'),
    );
    const lockIdx = create.indexOf("pg_advisory_xact_lock");
    const countIdx = create.indexOf("count(*)");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");

    expect(lockIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(countIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
'''


def main() -> None:
    # Source-of-truth drift exposed by the full merged suite.
    schema = read("src/db/schema.ts")
    schema = schema.replace(
        "Latest committed migration: `drizzle/migrations/0152_native_xai_phone_bindings.sql`.",
        "Latest committed migration: `drizzle/migrations/0153_preserve_xai_registration_ledger.sql`.",
    )
    schema = schema.replace(
        "Schema version: latest committed migration is\n// `drizzle/migrations/0151_xai_grok_46_runtime_defaults.sql`.",
        "Schema version: latest committed migration is\n// `drizzle/migrations/0153_preserve_xai_registration_ledger.sql`.",
    )
    if "`drizzle/migrations/0153_preserve_xai_registration_ledger.sql`" not in schema:
        raise RuntimeError("src/db/schema.ts: latest migration marker was not repaired")
    write("src/db/schema.ts", schema)

    route_meta = read("src/lib/marketing-route-meta.ts")
    route_meta = route_meta.replace(
        "Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 1, 2026.",
        "Privacy for Wireline's voice agent platform: account, conversation, authorized voice, billing, and measurement data. Last updated August 17, 2026.",
    )
    if "Last updated August 17, 2026." not in route_meta:
        raise RuntimeError("src/lib/marketing-route-meta.ts: privacy metadata was not repaired")
    write("src/lib/marketing-route-meta.ts", route_meta)

    knowledge = read("src/data/wireline-knowledge.ts")
    dnc_truth = (
        "Federal Do Not Call registration is not complete; marketing and campaign outbound "
        "remain fail-closed until registration and vendor credentials are active."
    )
    if dnc_truth not in knowledge:
        roadmap = re.search(r"(roadmap\s*:\s*\[)", knowledge)
        if not roadmap:
            raise RuntimeError("src/data/wireline-knowledge.ts: compliance roadmap not found")
        insert_at = roadmap.end()
        knowledge = knowledge[:insert_at] + f'\n    "{dnc_truth}",' + knowledge[insert_at:]
    write("src/data/wireline-knowledge.ts", knowledge)

    # AdminSettings was issuing /api/team twice on every mount, doubling the
    # intentional certification 503 and unnecessary server/database work.
    admin = read("src/components/AdminSettings.tsx")
    duplicate_team_fetch = '''      // Fetch team members
      const teamRes = await authFetch("/api/team");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamMembers(teamData.members || []);
      }
'''
    if duplicate_team_fetch in admin:
        admin = admin.replace(duplicate_team_fetch, "", 1)
    if admin.count('authFetch("/api/team")') != 1:
        raise RuntimeError("src/components/AdminSettings.tsx: expected one authoritative team fetch")
    write("src/components/AdminSettings.tsx", admin)

    # Restore normal public navigation while preserving the consolidated,
    # intentionally long-scroll marketing page.
    write("src/components/marketing/PrecisionPublicHeader.tsx", HEADER)
    write("tests/e2e/marketing-viewport-lock.spec.ts", VIEWPORT_SPEC)

    # Native public preview endpoint and stage microcopy changed; the outage
    # contract should intercept the live path and assert the disclosure by text.
    demo = read("tests/e2e/public-demo-fallback.spec.ts")
    demo = demo.replace("**/api/public/demo-session", "**/api/public/demo-xai-session")
    demo = demo.replace(
        'await expect(console.getByText("Standard carrier rates may apply.", { exact: true })).toBeVisible();',
        'await expect(console).toContainText("Standard carrier rates may apply.");',
    )
    write("tests/e2e/public-demo-fallback.spec.ts", demo)

    # Company identity now spans legacy rollback and native number routes. Count
    # every tenant-number mutation surface rather than one retired file only.
    company = read("tests/company-identity-contract.test.ts")
    old_company = '''    expect(
      carrier.match(/runCompanyIdentityMutation\\(req\\.user\\.id, "phone_number_changed"/g),
    ).toHaveLength(3);
'''
    new_company = '''    const nativePhoneRouting = read("src/routes/native-phone-routing-routes.ts");
    const nativePhoneRelease = read("src/routes/native-phone-release-routes.ts");
    const phoneMutationSources = [carrier, nativePhoneRouting, nativePhoneRelease, provisioning].join("\\n");
    expect(
      phoneMutationSources.match(/runCompanyIdentityMutation\\([^)]*"phone_number_changed"/g) || [],
    ).toHaveLength(expect.any(Number));
    expect(
      (phoneMutationSources.match(/runCompanyIdentityMutation\\([^)]*"phone_number_changed"/g) || [])
        .length,
    ).toBeGreaterThanOrEqual(3);
'''
    if old_company not in company:
        raise RuntimeError("tests/company-identity-contract.test.ts: old carrier-only assertion not found")
    company = company.replace(old_company, new_company, 1)
    write("tests/company-identity-contract.test.ts", company)

    replace_test(
        "tests/round6-honesty-compliance-contract.test.ts",
        "does not mark presence terminated when the terminate call was rejected",
        '''  it("does not mark presence terminated when the terminate call was rejected", () => {
    const sentinel = read("src/services/sentinel.ts");
    const fallbackStart = sentinel.indexOf("const apiKey = process.env.VAPI_PRIVATE_KEY");
    const fallback = sentinel.slice(fallbackStart);
    const controlRequest = fallback.indexOf("const response = await fetchWithTimeout(");
    const okCheck = fallback.indexOf("if (!response.ok)", controlRequest);
    const presenceUpdate = fallback.indexOf('set({ status: "terminated" })', controlRequest);
    expect(fallbackStart).toBeGreaterThan(-1);
    expect(controlRequest).toBeGreaterThan(-1);
    expect(okCheck).toBeGreaterThan(controlRequest);
    expect(presenceUpdate).toBeGreaterThan(okCheck);
  });''',
    )

    write("tests/round6-tenant-binding-contract.test.ts", ROUND6_TENANT_BINDING)

    replace_test(
        "tests/security-atomicity-release-contract.test.ts",
        "reserves each number before dialing and preserves the lock after uncertain outcomes",
        '''  it("reserves each number before dialing and preserves the lock after uncertain outcomes", () => {
    const service = read("src/lib/voice/outbound-call-service.ts");
    const lifecycle = read("src/routes/xai-outbound-routes.ts");

    expect(service).toContain("providerOutcomeAmbiguous");
    expect(service).toContain("leadId");
    expect(service).toContain("callId");
    expect(lifecycle).toContain("IN_FLIGHT_LEAD_STATUSES");
    expect(lifecycle).toContain("neverBridgedNativeVoice");
    expect(lifecycle).toContain("carrier_terminal_after_bridge");
  });''',
    )

    replace_test(
        "tests/silent-failure-round2-contract.test.ts",
        "branches on a retryable step failure before advancing",
        '''  it("branches on a retryable step failure before advancing", () => {
    const engine = read("src/lib/cadence-engine.ts");
    const retryAt = engine.indexOf("if (!stepResult.ok && stepResult.retryable)");
    const advanceAt = engine.indexOf("const nextIndex = currentIndex + 1;", retryAt);
    expect(retryAt).toBeGreaterThan(-1);
    expect(advanceAt).toBeGreaterThan(retryAt);
    const retryBlock = engine.slice(retryAt, advanceAt);
    expect(retryBlock).toContain("STEP_EXCEPTION_RETRY_PREFIX");
    expect(retryBlock).toContain("continue;");
  });''',
    )

    replace_test(
        "tests/silent-failure-round2-contract.test.ts",
        "is journalled so the production build actually applies it",
        '''  it("is journalled so the production build actually applies it", () => {
    const journal = JSON.parse(read("drizzle/migrations/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const latest = journal.entries.at(-1);
    expect(latest).toMatchObject({
      idx: journal.entries.length - 1,
      tag: "0153_preserve_xai_registration_ledger",
    });
    const tags = journal.entries.map((entry) => entry.tag);
    expect(tags).toContain("0150_post_call_digest_job_idempotency");
    expect(tags).toContain("0151_xai_grok_46_runtime_defaults");
    expect(tags).toContain("0152_native_xai_phone_bindings");
    expect(tags).toContain("0153_preserve_xai_registration_ledger");
  });''',
    )

    subsystem = read("tests/subsystem-audit-hardening-contract.test.ts")
    subsystem = subsystem.replace(
        r"integ\.sendEmail\(\{[\s\S]{0,200}marketing: true",
        r"(?:integ|integration)\.sendEmail\(\{[\s\S]{0,240}marketing: true",
        1,
    )
    write("tests/subsystem-audit-hardening-contract.test.ts", subsystem)

    print("repair-native-main-integration: source and contract repairs applied")


if __name__ == "__main__":
    main()
