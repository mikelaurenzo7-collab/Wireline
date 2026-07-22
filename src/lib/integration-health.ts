/* eslint-disable @typescript-eslint/no-explicit-any -- module operates on heterogeneous data shapes across integrations. */
import { drizzle } from "./server-context";
import * as schema from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  googleGrantedScopesAllowCalendarWrite,
  microsoftGrantedScopesAllowCalendarWrite,
} from "./oauth-helpers";

export interface IntegrationHealthResult {
  reconnect_google_calendar: boolean;
  reconnect_microsoft_calendar: boolean;
  calendar_scope_unknown_google: boolean;
  calendar_scope_unknown_microsoft: boolean;
  reconnect_hubspot: boolean;
  reconnect_salesforce: boolean;
  reconnect_google_sheets: boolean;
  reconnect_microsoft_mailbox: boolean;
  reasons: string[];
}

/**
 * Compares persisted OAuth scope strings with what calendar booking requires.
 * Rows created before scope persistence will flag `calendar_scope_unknown_*` until reconnect.
 * Also surfaces CRM / Sheets connections marked inactive after terminal token refresh failures.
 */
export async function computeIntegrationHealth(userId: string): Promise<IntegrationHealthResult> {
  const reasons: string[] = [];

  const emails = await drizzle
    .select({
      provider: schema.emailAccounts.provider,
      oauthGrantedScopes: schema.emailAccounts.oauthGrantedScopes,
      accessToken: schema.emailAccounts.accessToken,
      refreshToken: schema.emailAccounts.refreshToken,
    })
    .from(schema.emailAccounts)
    .where(eq(schema.emailAccounts.userId, userId));

  const cals = await drizzle
    .select({
      provider: schema.calendarAccounts.provider,
      oauthGrantedScopes: schema.calendarAccounts.oauthGrantedScopes,
      accessToken: schema.calendarAccounts.accessToken,
      refreshToken: schema.calendarAccounts.refreshToken,
    })
    .from(schema.calendarAccounts)
    .where(eq(schema.calendarAccounts.userId, userId));

  const hasGoogle =
    emails.some((r: any) => r.provider === "google") ||
    cals.some((r: any) => r.provider === "google");
  const hasMicrosoft =
    emails.some((r: any) => r.provider === "microsoft") ||
    cals.some((r: any) => r.provider === "microsoft");

  const googleScopeStrings: string[] = [
    ...emails.filter((r: any) => r.provider === "google").map((r: any) => r.oauthGrantedScopes),
    ...cals.filter((r: any) => r.provider === "google").map((r: any) => r.oauthGrantedScopes),
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  const msScopeStrings: string[] = [
    ...emails.filter((r: any) => r.provider === "microsoft").map((r: any) => r.oauthGrantedScopes),
    ...cals.filter((r: any) => r.provider === "microsoft").map((r: any) => r.oauthGrantedScopes),
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  let calendar_scope_unknown_google = false;
  let calendar_scope_unknown_microsoft = false;
  let reconnect_google_calendar = false;
  let reconnect_microsoft_calendar = false;
  let reconnect_microsoft_mailbox = false;

  if (hasGoogle) {
    if (googleScopeStrings.length === 0) {
      calendar_scope_unknown_google = true;
      reconnect_google_calendar = true;
      reasons.push(
        "Google is connected but OAuth scopes were not recorded (or pre-date scope tracking). Reconnect Google in Email settings to enable calendar booking.",
      );
    } else {
      const anyOk = googleScopeStrings.some((s) => googleGrantedScopesAllowCalendarWrite(s));
      if (!anyOk) {
        reconnect_google_calendar = true;
        reasons.push(
          "Google connection is missing calendar.events scope. Reconnect Google and approve calendar access.",
        );
      }
    }
  }

  if (hasMicrosoft) {
    if (msScopeStrings.length === 0) {
      calendar_scope_unknown_microsoft = true;
      reconnect_microsoft_calendar = true;
      reasons.push(
        "Microsoft is connected but OAuth scopes were not recorded. Reconnect Outlook to enable calendar booking.",
      );
    } else {
      const anyOk = msScopeStrings.some((s) => microsoftGrantedScopesAllowCalendarWrite(s));
      if (!anyOk) {
        reconnect_microsoft_calendar = true;
        reasons.push(
          "Microsoft connection needs Calendars.ReadWrite. Reconnect your Outlook account.",
        );
      }
    }

    // Terminal Microsoft refresh clears tokens — surface reconnect before tools no-op.
    const msRows = [...emails, ...cals].filter((r: any) => r.provider === "microsoft");
    if (
      msRows.some(
        (r: any) =>
          !r.accessToken || !r.refreshToken || r.accessToken === null || r.refreshToken === null,
      )
    ) {
      reconnect_microsoft_mailbox = true;
      reconnect_microsoft_calendar = true;
      reasons.push(
        "Microsoft mailbox/calendar tokens were revoked or expired. Reconnect Outlook in Connections.",
      );
    }
  }

  const inactiveCrm = await drizzle
    .select({
      provider: schema.crmConnections.provider,
    })
    .from(schema.crmConnections)
    .where(
      and(
        eq(schema.crmConnections.userId, userId),
        eq(schema.crmConnections.active, false),
        inArray(schema.crmConnections.provider, ["hubspot", "salesforce", "google_sheets"]),
      ),
    );

  const reconnect_hubspot = inactiveCrm.some((r) => r.provider === "hubspot");
  const reconnect_salesforce = inactiveCrm.some((r) => r.provider === "salesforce");
  const reconnect_google_sheets = inactiveCrm.some((r) => r.provider === "google_sheets");

  if (reconnect_hubspot) {
    reasons.push("HubSpot connection needs reconnect — CRM writeback is paused until you reconnect.");
  }
  if (reconnect_salesforce) {
    reasons.push(
      "Salesforce connection needs reconnect — CRM writeback is paused until you reconnect.",
    );
  }
  if (reconnect_google_sheets) {
    reasons.push(
      "Google Sheets connection needs reconnect — call logging to Sheets is paused until you reconnect.",
    );
  }

  return {
    reconnect_google_calendar,
    reconnect_microsoft_calendar,
    calendar_scope_unknown_google,
    calendar_scope_unknown_microsoft,
    reconnect_hubspot,
    reconnect_salesforce,
    reconnect_google_sheets,
    reconnect_microsoft_mailbox,
    reasons,
  };
}
