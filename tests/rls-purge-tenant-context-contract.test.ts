import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

// Round-4 audit: the GDPR purge and the MCP OAuth tables were both exposed to
// the wireline_server default-deny footgun (0114 fixed it for handoffs/recap
// artifacts but left the MCP tables out, and the purge inherited whatever
// tenant context its trigger path happened to run in). These contracts pin the
// three-layer fix: migration policies, runtime self-grant, and tenant-context
// immunity for the purge itself.

describe("GDPR purge tenant-context immunity", () => {
  it("purgeAccount and releaseExternalResourcesForPurge escape ambient tenant context", () => {
    const source = read("src/lib/account-deletion.ts");
    expect(source).toContain('import { drizzle, tenantStore } from "./server-context"');
    expect(source).toContain(
      "tenantStore.exit(() => purgeAccountOutsideTenantContext(userId, deps))",
    );
    expect(source).toContain(
      "tenantStore.exit(() => releaseExternalResourcesOutsideTenantContext(userId, deps))",
    );
  });
});

describe("MCP OAuth tables wireline_server access", () => {
  it("ensureMcpSchema self-grants and creates wireline_server policies at runtime", () => {
    const source = read("src/routes/chatgpt-mcp-routes.ts");
    for (const table of [
      "wireline_mcp_oauth_codes",
      "wireline_mcp_access_tokens",
      "wireline_mcp_refresh_tokens",
    ]) {
      expect(source).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(source).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO wireline_server",
    );
    expect(source).toContain(
      "CREATE POLICY tenant_isolation ON public.%I FOR ALL TO wireline_server USING (user_id = (SELECT public.wireline_current_user_id())) WITH CHECK (user_id = (SELECT public.wireline_current_user_id()))",
    );
    expect(source).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wireline_mcp_oauth_clients TO wireline_server",
    );
    expect(source).toContain(
      "CREATE POLICY wireline_server_access ON public.wireline_mcp_oauth_clients FOR ALL TO wireline_server USING (true) WITH CHECK (true)",
    );
  });

  it("migration 0115 creates the permissive wireline_server policies 0114 left out", () => {
    const migration = read("drizzle/migrations/0115_mcp_tables_wireline_server_policies.sql");
    for (const table of [
      "wireline_mcp_oauth_codes",
      "wireline_mcp_access_tokens",
      "wireline_mcp_refresh_tokens",
    ]) {
      expect(migration).toContain(`'${table}'`);
    }
    expect(migration).toContain(
      "CREATE POLICY tenant_isolation ON public.%I FOR ALL TO wireline_server",
    );
    expect(migration).toContain("wireline_mcp_oauth_clients");
    expect(migration).toContain("wireline_server_access");
    // Idempotency: the live DB is managed out-of-band, so re-runs must be safe.
    expect(migration).toContain("DROP POLICY IF EXISTS");
    expect(migration).toContain("to_regclass");
  });
});
