/**
 * Shared Stitch tenant branding helpers (client + server safe — no DB imports).
 */
import { BRAND } from "../constants/brand-colors";

export interface StitchTenantBranding {
  brandName: string | null;
  brandLogoUrl: string | null;
  primaryColor: string | null;
  businessName: string | null;
  businessType: string | null;
  primaryProduct: string | null;
}

export interface StitchBriefOptions {
  /** Operator enabled Wireline Design mode in the composer — route every message to Stitch. */
  designMode?: boolean;
  /** When true, merge account branding into design.md (default: true if branding exists). */
  useAccountBranding?: boolean;
}

export function stitchBrandingFromSnake(settings: {
  brand_name?: string | null;
  brand_logo_url?: string | null;
  primary_color?: string | null;
  business_name?: string | null;
  business_type?: string | null;
  primary_product?: string | null;
}): StitchTenantBranding {
  return {
    brandName: settings.brand_name?.trim() || null,
    brandLogoUrl: settings.brand_logo_url?.trim() || null,
    primaryColor: settings.primary_color?.trim() || null,
    businessName: settings.business_name?.trim() || null,
    businessType: settings.business_type?.trim() || null,
    primaryProduct: settings.primary_product?.trim() || null,
  };
}

export function hasConfiguredTenantBranding(branding: StitchTenantBranding): boolean {
  if (branding.brandLogoUrl) return true;
  const color = branding.primaryColor?.toLowerCase();
  if (color && color !== BRAND.purple.toLowerCase() && color !== "#7c3aed") return true;
  const displayName = (branding.brandName || branding.businessName || "").trim();
  if (displayName && displayName.toLowerCase() !== "wireline") return true;
  if (branding.businessType?.trim()) return true;
  if (branding.primaryProduct?.trim()) return true;
  return false;
}

export function resolveUseAccountBranding(
  options: StitchBriefOptions | undefined,
  branding: StitchTenantBranding,
): boolean {
  if (options?.useAccountBranding === false) return false;
  return hasConfiguredTenantBranding(branding);
}
