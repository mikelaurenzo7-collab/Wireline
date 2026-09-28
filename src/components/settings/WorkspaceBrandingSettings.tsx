import { useEffect, useRef, useState } from "react";

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
  const {
    branding,
    updateBranding,
    isLoading,
    isSaving: saving,
    saveDraft,
    saveError,
    beginBrandingSave,
  } = useBranding();
  const { success: toastSuccess, error: toastError } = useToast();
  const [form, setForm] = useState<WorkspaceBrandForm>(EMPTY);
  const savingRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    const source = saveDraft ?? branding;
    setForm({
      brand_name: source.brand_name || "",
      brand_logo_url: source.brand_logo_url || "",
      primary_color: source.primary_color || BRAND.colors.primary,
    });
  }, [branding, isLoading, saveDraft]);

  async function save() {
    if (savingRef.current || isLoading) return;
    const releaseSave = beginBrandingSave(form);
    if (!releaseSave) return;
    savingRef.current = true;
    let failure: string | null = null;
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
      failure = error instanceof Error ? error.message : "Brand settings could not be saved.";
      toastError("Save failed", failure);
    } finally {
      savingRef.current = false;
      releaseSave(failure);
    }
  }

  return (
    <WorkspaceBrandEditor
      settings={form}
      onUpdate={(next) => {
        if (!saving && !savingRef.current && !isLoading) setForm(next);
      }}
      onSave={() => void save()}
      isSaving={saving}
      isLoading={isLoading}
      saveError={saveError}
    />
  );
}
