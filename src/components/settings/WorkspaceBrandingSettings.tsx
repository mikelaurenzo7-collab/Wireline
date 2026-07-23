import { useEffect, useState } from "react";

import WorkspaceBrandEditor, { type WorkspaceBrandForm } from "./WorkspaceBrandEditor";
import { useBranding } from "../../contexts/BrandingContext";
import { useToast } from "../../contexts/ToastContext";
import { authFetch, safeJson } from "../../lib/api";
import { BRAND } from "../../constants/brand-colors";

const EMPTY: WorkspaceBrandForm = {
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
  const [form, setForm] = useState<WorkspaceBrandForm>(EMPTY);
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
    <WorkspaceBrandEditor
      settings={form}
      onUpdate={setForm}
      onSave={() => void save()}
      isSaving={saving}
    />
  );
}
