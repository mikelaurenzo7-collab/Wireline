import { useEffect, useState } from "react";

import { BrandingPanel } from "../admin/BrandingPanel";
import { useBranding } from "../../contexts/BrandingContext";
import { useToast } from "../../contexts/ToastContext";
import { authFetch, safeJson } from "../../lib/api";
import { BRAND } from "../../constants/brand-colors";

type BrandingForm = {
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
};

const EMPTY: BrandingForm = {
  brand_name: "",
  brand_logo_url: "",
  primary_color: BRAND.colors.primary,
};

/**
 * Owner-facing workspace brand controls — name, logo, primary color.
 * Lives on Settings → Appearance so branding is not buried under Admin.
 */
export default function WorkspaceBrandingSettings() {
  const { branding, updateBranding, isLoading } = useBranding();
  const { success: toastSuccess, error: toastError } = useToast();
  const [form, setForm] = useState<BrandingForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    setForm({
      brand_name: branding.brand_name || "",
      brand_logo_url: branding.brand_logo_url || "",
      primary_color: branding.primary_color || BRAND.colors.primary,
    });
  }, [branding, isLoading]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = (await safeJson(response)) as { error?: string; message?: string } | null;
        throw new Error(
          body?.error || body?.message || `Brand settings could not be saved (${response.status}).`,
        );
      }
      updateBranding(form);
      toastSuccess("Brand saved", "Workspace name, logo, and color updated.");
    } catch (error) {
      toastError(
        "Save failed",
        error instanceof Error ? error.message : "Brand settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="brand" className="mt-5 scroll-mt-24">
      <BrandingPanel
        settings={form}
        onUpdate={(next) =>
          setForm({
            brand_name: next.brand_name || "",
            brand_logo_url: next.brand_logo_url || "",
            primary_color: next.primary_color || BRAND.colors.primary,
          })
        }
        onSave={() => void save()}
        isSaving={saving}
      />
    </section>
  );
}
