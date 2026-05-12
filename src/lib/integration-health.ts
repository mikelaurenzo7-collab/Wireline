import { db } from "./server-context";
import {
  googleGrantedScopesAllowCalendarWrite,
  microsoftGrantedScopesAllowCalendarWrite,
} from "./oauth-helpers";

export interface IntegrationHealthResult {
  reconnect_google_calendar: boolean;
  reconnect_microsoft_calendar: boolean;
  calendar_scope_unknown_google: boolean;
  calendar_scope_unknown_microsoft: boolean;
  reasons: string[];
}

/**
 * Compares persisted OAuth scope strings with what calendar booking requires.
 * Rows created before scope persistence will flag `calendar_scope_unknown_*` until reconnect.
 */
export async function computeIntegrationHealth(userId: string): Promise<IntegrationHealthResult> {
  const reasons: string[] = [];

  const { data: emails } = await db
    .from("wireline_email_accounts")
    .select("provider, oauth_granted_scopes")
    .eq("user_id", userId);

  const { data: cals } = await db
    .from("wireline_calendar_accounts")
    .select("provider, oauth_granted_scopes")
    .eq("user_id", userId);

  const hasGoogle =
    !!(emails || []).some((r: any) => r.provider === "google") ||
    !!(cals || []).some((r: any) => r.provider === "google");
  const hasMicrosoft =
    !!(emails || []).some((r: any) => r.provider === "microsoft") ||
    !!(cals || []).some((r: any) => r.provider === "microsoft");

  const googleScopeStrings: string[] = [
    ...(emails || []).filter((r: any) => r.provider === "google").map((r: any) => r.oauth_granted_scopes),
    ...(cals || []).filter((r: any) => r.provider === "google").map((r: any) => r.oauth_granted_scopes),
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  const msScopeStrings: string[] = [
    ...(emails || []).filter((r: any) => r.provider === "microsoft").map((r: any) => r.oauth_granted_scopes),
    ...(cals || []).filter((r: any) => r.provider === "microsoft").map((r: any) => r.oauth_granted_scopes),
  ].filter((s): s is string => typeof s === "string" && s.trim().length > 0);

  let calendar_scope_unknown_google = false;
  let calendar_scope_unknown_microsoft = false;
  let reconnect_google_calendar = false;
  let reconnect_microsoft_calendar = false;

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
  }

  return {
    reconnect_google_calendar,
    reconnect_microsoft_calendar,
    calendar_scope_unknown_google,
    calendar_scope_unknown_microsoft,
    reasons,
  };
}
