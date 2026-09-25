import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function reelBeatPaths(kit: string): string[] {
  const start = kit.indexOf("const reels = [");
  const end = kit.indexOf("for (const reel of reels)");
  if (start < 0 || end <= start) return [];
  const reels = kit.slice(start, end);
  return [...reels.matchAll(/route:\s*["'`]([^"'`]+)["'`]/g)]
    .map((match) => new URL(match[1], "https://botbound.app").pathname)
    .filter((path, index, all) => all.indexOf(path) === index)
    .sort();
}

function declaredRoutePaths(appRoutes: string): Set<string> {
  return new Set(
    [...appRoutes.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => !path.includes("*")),
  );
}

describe("launch completeness contracts", () => {
  it("routes the launch-reel command through the certifying wrapper and Vercel gate", () => {
    const pkg = JSON.parse(source("package.json")) as { scripts?: Record<string, string> };
    const vercelBuild = source("scripts/vercel-build.mjs");
    expect(pkg.scripts?.["marketing:kit"]).toBe("node scripts/run-marketing-kit.mjs");
    expect(pkg.scripts?.["marketing:kit:raw"]).toBe("node scripts/marketing-kit.mjs");
    expect(vercelBuild).toContain('"tests/launch-completeness-contract.test.ts"');
  });

  it("freezes the exact source before capture and rejects unsafe output", () => {
    const wrapper = source("scripts/run-marketing-kit.mjs");
    const sourceVerifier = source("scripts/lib/release-source-verification.mjs");
    const provenanceIndex = wrapper.indexOf("const sourceCommit = resolveSourceCommit(repoRoot);");
    const captureIndex = wrapper.indexOf("const capture = spawnSync");
    expect(provenanceIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(provenanceIndex);
    expect(wrapper).toContain('./lib/release-source-verification.mjs"');
    expect(wrapper.match(/assertCleanCheckout\(repoRoot, sourceCommit\);/g)).toHaveLength(2);
    expect(wrapper).toContain("const beforeCapture = await verifyCaptureOrigins(sourceCommit)");
    expect(wrapper).toContain("const afterCapture = await verifyCaptureOrigins(sourceCommit)");
    expect(sourceVerifier).toContain("source_commit_check");
    expect(sourceVerifier).toContain('response.headers.get("x-wireline-source-commit")');
    expect(wrapper).toContain("path.relative(outputRoot, resolved)");
    expect(wrapper).toMatch(/escapes marketing-kit\//);
    expect(wrapper).toContain("release-record.json");
    expect(wrapper).toContain("AUTHENTICATED_SCREENSHOT_IDS");
    expect(wrapper).toMatch(/byte-identical routes/);
    expect(wrapper).toMatch(/Expected exactly 3 launch-reel captures/);
    expect(wrapper).toMatch(/Expected authenticated screenshot certification/);
  });

  it("keeps every reel beat on a declared route instead of filming the authenticated 404", () => {
    const kit = source("scripts/marketing-kit.mjs");
    const appRoutes = source("src/routes/AppRoutes.tsx");
    const beats = reelBeatPaths(kit);
    const declared = declaredRoutePaths(appRoutes);
    const missing = beats.filter((path) => !declared.has(path));
    expect(beats).toEqual(["/", "/inbox", "/knowledge", "/overview", "/phone", "/studio"]);
    expect(
      missing,
      `Launch reel beats reference routes absent from AppRoutes: ${missing.join(", ")}. A stale scene route records the authenticated 404 and can still look like a unique certified frame.`,
    ).toEqual([]);
  });

  it("preserves the retired email deep link and its state while Inbox remains canonical", () => {
    const appRoutes = source("src/routes/AppRoutes.tsx");
    expect(appRoutes).toContain('<Route path="/inbox" element={<EmailPage />} />');
    expect(appRoutes).toContain("function EmailToInboxRedirect()");
    expect(appRoutes).toContain("`/inbox${location.search}${location.hash}`");
    expect(appRoutes).toContain('<Route path="/email" element={<EmailToInboxRedirect />} />');
  });

  it("does not call an unproven published edit release-current", () => {
    const mediaKit = source("docs/LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md");
    expect(mediaKit).toContain("release-current");
    expect(mediaKit).toContain("marketing-kit/release-record.json");
    expect(mediaKit).toContain("sourceCommit");
    expect(mediaKit).toContain("deployed production SHA");
    expect(mediaKit).toContain("Raw output is not release-certified.");
  });

  it("keeps runtime health backstage after retiring the customer-facing provider page", () => {
    const app = source("src/App.tsx");
    const probe = source("src/lib/public-health-probe.ts");
    const marketingMeta = source("src/lib/marketing-route-meta.ts");
    const publicRoutes = source("src/lib/public-routes.ts");
    const apiRoutes = source("src/server/register-api-routes.ts");
    const vercel = JSON.parse(source("vercel.json")) as {
      redirects?: Array<{ source: string; destination: string; permanent: boolean }>;
    };
    const sitemap = source("public/sitemap.xml");
    const publicSurfaces = [
      "src/components/marketing/MarketingChromeBar.tsx",
      "src/components/marketing/MarketingFooter.tsx",
      "src/components/marketing/TrustSignals.tsx",
      "src/components/marketing/WireAgentLanding.tsx",
      "src/components/auth/AuthAccessPanel.tsx",
      "src/components/Security.tsx",
      "src/components/PublicChangelog.tsx",
    ];

    expect(existsSync(resolve(root, "src/components/Status.tsx"))).toBe(false);
    expect(app).not.toContain('import("./components/Status")');
    expect(app).not.toContain('path="/status"');
    expect(marketingMeta).not.toContain('"/status":');
    expect(publicRoutes).not.toContain('"/status"');
    expect(sitemap).not.toContain("botbound.app/status");
    expect(vercel.redirects).toContainEqual({
      source: "/status",
      destination: "/trust",
      permanent: true,
    });
    for (const surface of publicSurfaces) {
      expect(source(surface)).not.toContain('"/status"');
    }
    expect(apiRoutes).toContain('app.all("/api/health/public"');
    expect(probe).toContain('fetch("https://api.openai.com/v1/responses"');
    expect(probe).toContain("store: false");
  });

  it("makes agent/account ownership a database-owned invariant", () => {
    const migration = source("drizzle/migrations/0143_agent_account_binding.sql");
    const journal = source("drizzle/migrations/meta/_journal.json");
    expect(journal).toContain('"tag": "0143_agent_account_binding"');
    expect(migration).toContain("UPDATE public.wireline_agents AS a");
    expect(migration).toContain("WHERE a.account_id IS NULL");
    expect(migration).toContain("wireline_enforce_agent_account_binding");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF user_id, account_id");
    expect(migration).toContain("wa.user_id = NEW.user_id");
    expect(migration).toContain("Agent account does not belong to agent owner");
    expect(migration).toContain("Agent owner has no account to bind");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
  });

  it("cascades account deletion through every user-bound auth artifact", () => {
    const migration = source("drizzle/migrations/0144_auth_token_user_cascades.sql");
    const oauthSecurity = source("src/lib/mcp-oauth-security.ts");
    const journal = source("drizzle/migrations/meta/_journal.json");
    expect(journal).toContain('"tag": "0144_auth_token_user_cascades"');
    for (const table of [
      "wireline_password_reset_tokens",
      "wireline_email_verification_tokens",
      "wireline_mcp_oauth_codes",
      "wireline_mcp_access_tokens",
      "wireline_mcp_refresh_tokens",
      "wireline_oauth_pending_codes",
    ])
      expect(migration).toContain(`public.${table}`);
    expect(
      migration.match(/REFERENCES public\.wireline_users\(id\) ON DELETE CASCADE/g),
    ).toHaveLength(6);
    expect(migration).toContain("DELETE FROM public.wireline_password_reset_tokens");
    expect(migration).toContain("DELETE FROM public.wireline_email_verification_tokens");
    expect(migration).toContain(
      "DELETE FROM public.wireline_mcp_oauth_codes WHERE expires_at < now()",
    );
    expect(migration).toContain(
      "DELETE FROM public.wireline_mcp_access_tokens WHERE expires_at < now()",
    );
    expect(migration).toContain(
      "DELETE FROM public.wireline_mcp_refresh_tokens WHERE expires_at < now()",
    );
    for (const index of [
      "idx_mcp_oauth_codes_user_id",
      "idx_mcp_access_tokens_user_id",
      "idx_mcp_refresh_tokens_user_id",
      "idx_oauth_pending_codes_user_id",
      "idx_mcp_oauth_codes_expires_at",
    ])
      expect(migration).toContain(`CREATE INDEX IF NOT EXISTS ${index}`);
    expect(oauthSecurity).toContain("pruneExpiredMcpOAuthRows");
    expect(oauthSecurity).toContain(
      "DELETE FROM wireline_mcp_oauth_codes WHERE expires_at < now()",
    );
  });

  it("reconciles only historical rows already covered by the current deletion contract", () => {
    const migration = source(
      "drizzle/migrations/0145_reconcile_historical_deleted_user_artifacts.sql",
    );
    const deletion = source("src/lib/account-deletion.ts");
    const journal = source("drizzle/migrations/meta/_journal.json");
    const reconciled = [
      "wireline_director_conversation_messages",
      "wireline_dnc_list",
      "wireline_audit_log",
      "wireline_training_backup_20260609",
    ];
    expect(journal).toContain('"tag": "0145_reconcile_historical_deleted_user_artifacts"');
    for (const table of reconciled) {
      expect(migration).toContain(`DELETE FROM public.${table}`);
      expect(deletion).toContain(`table: "${table}"`);
    }
    expect(migration).not.toContain("DELETE FROM public.wireline_jobs");
  });
});
