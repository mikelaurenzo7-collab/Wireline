import { readFileSync } from "node:fs";
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
    .map((match) => new URL(match[1], "https://trywireline.com").pathname)
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
    const pkg = JSON.parse(source("package.json")) as {
      scripts?: Record<string, string>;
    };
    const vercelBuild = source("scripts/vercel-build.mjs");

    expect(pkg.scripts?.["marketing:kit"]).toBe("node scripts/run-marketing-kit.mjs");
    expect(pkg.scripts?.["marketing:kit:raw"]).toBe("node scripts/marketing-kit.mjs");
    expect(vercelBuild).toContain('"tests/launch-completeness-contract.test.ts"');
  });

  it("freezes the exact source before capture and rejects unsafe output", () => {
    const wrapper = source("scripts/run-marketing-kit.mjs");
    const provenanceIndex = wrapper.indexOf("const sourceCommit = resolveSourceCommit();");
    const captureIndex = wrapper.indexOf("const capture = spawnSync");

    expect(provenanceIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeGreaterThan(provenanceIndex);
    expect(wrapper).toContain("assertCleanCheckout(sourceCommit);");
    expect(wrapper.match(/assertCleanCheckout\(sourceCommit\);/g)).toHaveLength(2);
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

    expect(beats).toEqual([
      "/",
      "/email",
      "/knowledge",
      "/overview",
      "/phone",
      "/settings/phone",
      "/studio",
    ]);
    expect(
      missing,
      `Launch reel beats reference routes absent from AppRoutes: ${missing.join(", ")}. ` +
        "A stale scene route records the authenticated 404 and can still look like a unique certified frame.",
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

  it("keeps public status cadence and claims aligned with the probes", () => {
    const status = source("src/components/Status.tsx");
    const probe = source("src/lib/public-health-probe.ts");
    const marketingMeta = source("src/lib/marketing-route-meta.ts");

    expect(status).toContain("const STATUS_REFRESH_MS = 60_000;");
    expect(status).toContain('cache: "no-store"');
    expect(status).toMatch(/window\.setInterval\([\s\S]*STATUS_REFRESH_MS\)/);
    expect(status).toContain("Page refreshes every 60 seconds.");
    expect(status).toContain("page refreshes every 60s.");
    expect(status).toContain("Page refresh · 60s");
    expect(status).toContain("Normal cache · 120s");
    expect(status).toContain("Server fallback · up to 5m");
    expect(status).toContain("edge stale-while-revalidate");
    expect(status).toContain("timestamp above is the authoritative age");
    expect(status).toContain("minimal,\n              non-persistent OpenAI Responses inference");
    expect(marketingMeta).toContain(
      "Live access checks for Wireline's managed voice control plane and reasoning runtime. Page refreshes every 60 seconds.",
    );
    expect(probe).toContain('fetch("https://api.openai.com/v1/responses"');
    expect(probe).toContain("store: false");
    expect(status).toContain("Provider checks operational");
    expect(status).toContain("Managed voice access");
    expect(status).toContain("Reasoning model access");
    expect(status).toContain("not an end-to-end customer call");
    expect(status).not.toContain("All systems operational");
    expect(status).not.toContain("pings each production LLM tier");
    expect(status).not.toContain("configured fallback remains available");
    expect(status).not.toContain("without placing a call or generating content");
  });

  it("keeps the public status poll bounded and leak-free", () => {
    const status = source("src/components/Status.tsx");

    expect(status).toContain("const STATUS_FETCH_TIMEOUT_MS = 15_000;");
    expect(status).toContain("const controller = new AbortController();");
    expect(status).toContain(
      "window.setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS)",
    );
    expect(status).toContain("signal: controller.signal,");
    expect(status).toContain("window.clearTimeout(timeout);");
    expect(status).not.toMatch(/signal:\s*AbortSignal\.timeout/);
    expect(status).not.toMatch(/=\s*AbortSignal\.timeout\(/);
    expect(status).toContain("await res.body?.cancel().catch(() => undefined);");
    expect(status).toContain("{error && data ? (");
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
    ]) {
      expect(migration).toContain(`public.${table}`);
    }
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
    ]) {
      expect(migration).toContain(`CREATE INDEX IF NOT EXISTS ${index}`);
    }
    expect(oauthSecurity).toContain("pruneExpiredMcpOAuthRows");
    expect(oauthSecurity).toContain("DELETE FROM wireline_mcp_oauth_codes WHERE expires_at < now()");
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