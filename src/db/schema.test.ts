import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm/utils";
import * as schema from "./schema";

/**
 * Schema column reachability tests.
 *
 * These tests guard against the class of bug where a route handler queries
 * `schema.someTable.someColumn` but the column was never declared in the
 * Drizzle table. Because Drizzle's pgTable type is loose and the workspace
 * tsconfig does not run with strict mode, undefined column references
 * compile cleanly and only surface at runtime (typically swallowed by a
 * try/catch). Each entry below was discovered during a real audit where the
 * production query silently returned 0 results or threw an error caught by
 * a route's catch-all.
 */

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  emailThreads: [
    // Used by GET /api/nav-counts to count unread threads.
    "read",
    // Used by /api/claude/qualify, /api/claude/smart-reply,
    // /api/claude/quick-replies to look up the owning agent from a thread.
    "agentId",
  ],
  // Tenant-default autonomy mode used by action-engine.executeAction.
  settings: ["autonomyLevel"],
  // OAuth scope tracking used by computeIntegrationHealth.
  emailAccounts: ["oauthGrantedScopes"],
  // OAuth scope tracking + onConflict upsert key in /api/oauth/*/callback.
  calendarAccounts: ["oauthGrantedScopes", "emailAddress"],
  // Used by GET /api/contacts/:number to find the email for a phone number.
  leadDossiers: ["customerEmail"],
  // Surfaced by GET /api/callbacks and written by AI Action Engine.
  outboundLeads: ["callbackScheduledAt", "lastContactSummary"],
  // The AI Action Engine writes proposed action bodies (draft email,
  // contract envelope IDs, prospect search args) into this jsonb column;
  // GET /api/fleet/tasks surfaces it to ActionFeed.
  fleetTasks: ["payload"],
  // The OAuth callbacks (Salesforce/HubSpot/Slack/Zoom) write the
  // human-readable account label here; GET /api/oauth/crm/status reads
  // it to render CrmConnectionCard.
  crmConnections: ["connectedEmail"],
};

describe("schema column reachability", () => {
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const table = (schema as unknown as Record<string, unknown>)[tableName];
    it(`${tableName} is exported from schema`, () => {
      expect(table).toBeTruthy();
    });

    const tableColumns = getTableColumns(table as Parameters<typeof getTableColumns>[0]);
    for (const column of columns) {
      it(`${tableName}.${column} exists`, () => {
        expect(tableColumns).toHaveProperty(column);
      });
    }
  }
});
