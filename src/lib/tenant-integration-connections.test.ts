import { describe, expect, it } from "vitest";
import { filterToolsByTenantConnections } from "./tenant-integration-connections";
import type { TenantIntegrationConnections } from "./tenant-integration-connections";

const baseConn: TenantIntegrationConnections = {
  shopify: false,
  square: false,
  slack: false,
  x: false,
  microsoft_teams: false,
  microsoft_excel: false,
  salesforce: false,
  hubspot: false,
  zoom: false,
  google_calendar: false,
  microsoft_calendar: false,
  google_mail: false,
  microsoft_mail: false,
};

describe("filterToolsByTenantConnections — X", () => {
  it("gates engagement tools on tenant X connection", () => {
    const tools = [
      "post_x_tweet",
      "reply_to_x_tweet",
      "like_x_tweet",
      "repost_x_tweet",
      "send_x_dm",
      "list_x_mentions",
    ] as const;

    expect(filterToolsByTenantConnections(tools, baseConn)).toEqual([]);

    const withX = filterToolsByTenantConnections(tools, { ...baseConn, x: true });
    expect(withX).toEqual([...tools]);
  });

  it("gates ads tools on platform X Ads credentials", () => {
    const tools = ["list_x_ad_campaigns", "get_x_ad_campaign_stats"] as const;
    const env = process.env;

    delete process.env.X_API_KEY;
    delete process.env.X_API_SECRET;
    delete process.env.X_ADS_ACCESS_TOKEN;
    delete process.env.X_ADS_ACCESS_TOKEN_SECRET;
    delete process.env.X_ADS_ACCOUNT_ID;
    expect(filterToolsByTenantConnections(tools, { ...baseConn, x: true })).toEqual([]);

    process.env.X_API_KEY = "k";
    process.env.X_API_SECRET = "s";
    process.env.X_ADS_ACCESS_TOKEN = "at";
    process.env.X_ADS_ACCESS_TOKEN_SECRET = "ats";
    process.env.X_ADS_ACCOUNT_ID = "act_1";
    expect(filterToolsByTenantConnections(tools, baseConn)).toEqual([...tools]);

    process.env = env;
  });
});
