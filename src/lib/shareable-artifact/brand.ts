/**
 * Workspace brand resolver.
 *
 * Reads the tenant's workspace surface settings and returns a validated
 * shape that the template shell can safely inline. Every field has a
 * Wireline-owned fallback; invalid data is silently swapped for the
 * fallback so a bad row can never break the render pipeline.
 */
import { eq } from "drizzle-orm";

import * as schema from "../../db/schema";
import { drizzle } from "../server-context";
import type { StripePlan } from "../plan-catalog";
import { canWhiteLabelProposals } from "./entitlement";
import { isValidAccentHex, WIRELINE_LETTERPRESS_PALETTE, type LetterpressTheme } from "./design";

export interface WorkspaceBrand {
  displayName: string;
  accentHex: string | null;
  theme: LetterpressTheme;
  logoUrl: string | null;
  contactLine: string | null;
  wirelineCreditVisible: boolean;
}

const TRUSTED_LOGO_HOSTS: readonly string[] = [
  "trywireline.com",
  "cdn.trywireline.com",
  "assets.trywireline.com",
];

function sanitizeDisplayName(candidate: unknown, fallback: string): string {
  if (typeof candidate !== "string") return fallback;
  const trimmed = candidate.replace(/[\p{Cc}\p{Cn}]+/gu, "").trim();
  if (!trimmed) return fallback;
  return trimmed.length > 80 ? trimmed.slice(0, 80) : trimmed;
}

function sanitizeContactLine(candidate: unknown): string | null {
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.replace(/[\p{Cc}\p{Cn}]+/gu, "").trim();
  if (!trimmed) return null;
  return trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
}

function sanitizeLogoUrl(candidate: unknown): string | null {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return null;
    if (!TRUSTED_LOGO_HOSTS.includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function sanitizeTheme(candidate: unknown): LetterpressTheme {
  return candidate === "cool_light" ? "coolLight" : "obsidian";
}

/**
 * Resolve the tenant's workspace brand for a template render. The `plan`
 * caps how much of the brand is honored — Starter Plus workspaces cannot
 * hide the Wireline credit line on proposals, for example.
 */
export async function resolveWorkspaceBrand(
  userId: string,
  plan: StripePlan | null,
): Promise<WorkspaceBrand> {
  const fallbackDisplayName = "Wireline Workspace";
  const fallback: WorkspaceBrand = {
    displayName: fallbackDisplayName,
    accentHex: null,
    theme: "obsidian",
    logoUrl: null,
    contactLine: null,
    wirelineCreditVisible: true,
  };
  try {
    const [row] = await drizzle
      .select({
        workspaceDisplayName: schema.settings.workspaceDisplayName,
        workspaceAccentHex: schema.settings.workspaceAccentHex,
        workspaceTheme: schema.settings.workspaceTheme,
        workspaceLogoUrl: schema.settings.workspaceLogoUrl,
        workspaceContactLine: schema.settings.workspaceContactLine,
        workspaceWirelineCreditVisible: schema.settings.workspaceWirelineCreditVisible,
        businessName: schema.settings.businessName,
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId))
      .limit(1);

    if (!row) return fallback;

    const displayName = sanitizeDisplayName(
      row.workspaceDisplayName ?? row.businessName,
      fallbackDisplayName,
    );
    const theme = sanitizeTheme(row.workspaceTheme);
    const accentHex = isValidAccentHex(row.workspaceAccentHex, theme)
      ? row.workspaceAccentHex
      : null;
    const logoUrl = sanitizeLogoUrl(row.workspaceLogoUrl);
    const contactLine = sanitizeContactLine(row.workspaceContactLine);
    const wirelineCreditVisible = canWhiteLabelProposals(plan)
      ? Boolean(row.workspaceWirelineCreditVisible)
      : true;

    return { displayName, accentHex, theme, logoUrl, contactLine, wirelineCreditVisible };
  } catch {
    return fallback;
  }
}

/**
 * Resolve the accent applied to a rendered page — brand override or theme
 * default — but honor the two grounds separately so the accent stays
 * readable whether the viewer's OS is in dark or light mode. A tenant-
 * supplied accent that fails contrast on one ground falls back to that
 * ground's Wireline default.
 */
export function accentForTheme(brand: WorkspaceBrand): {
  obsidian: string;
  coolLight: string;
} {
  const override = brand.accentHex;
  const obsidian =
    override && isValidAccentHex(override, "obsidian")
      ? override
      : WIRELINE_LETTERPRESS_PALETTE.obsidian.actionPrimary;
  const coolLight =
    override && isValidAccentHex(override, "coolLight")
      ? override
      : WIRELINE_LETTERPRESS_PALETTE.coolLight.actionPrimary;
  return { obsidian, coolLight };
}
