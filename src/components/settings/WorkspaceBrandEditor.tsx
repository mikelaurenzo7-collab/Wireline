import { useId } from "react";

import { Button } from "../atoms";
import { Input } from "../ui/shadcn/Input";
import { BRAND } from "../../constants/brand-colors";

export type WorkspaceBrandForm = {
  brand_name: string;
  brand_logo_url: string;
  primary_color: string;
};

type WorkspaceBrandEditorProps = {
  settings: WorkspaceBrandForm;
  onUpdate: (next: WorkspaceBrandForm) => void;
  onSave: () => void;
  isSaving?: boolean;
};

/**
 * Letterpress owner brand editor — live color preview, no Admin chrome.
 */
export default function WorkspaceBrandEditor({
  settings,
  onUpdate,
  onSave,
  isSaving = false,
}: WorkspaceBrandEditorProps) {
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const logoId = `${baseId}-logo`;
  const colorId = `${baseId}-color`;
  const colorTextId = `${baseId}-color-text`;
  const primary = settings.primary_color || BRAND.colors.primary;
  const name = settings.brand_name.trim() || "Wireline";

  return (
    <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
      <div className="mb-5">
        <p className="wl-eyebrow wl-eyebrow--muted">Workspace brand</p>
        <h2 className="mt-2 font-[var(--wireline-font-family-display)] text-xl tracking-[-0.02em] text-foreground">
          Name, logo, and color
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label htmlFor={nameId} className="app-field-label">
              Workspace name
            </label>
            <Input
              id={nameId}
              type="text"
              placeholder="Your workspace name"
              className="app-input-soft h-auto py-3"
              value={settings.brand_name}
              onChange={(event) => onUpdate({ ...settings, brand_name: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={logoId} className="app-field-label">
              Logo URL
            </label>
            <Input
              id={logoId}
              type="url"
              placeholder="https://assets.yoursite.com/logo.png"
              className="app-input-soft h-auto py-3"
              value={settings.brand_logo_url}
              onChange={(event) => onUpdate({ ...settings, brand_logo_url: event.target.value })}
            />
          </div>
          <div>
            <label htmlFor={colorId} className="app-field-label">
              Primary color
            </label>
            <div className="flex gap-2.5">
              <Input
                id={colorId}
                type="color"
                aria-label="Primary color swatch"
                className="h-11 w-11 cursor-pointer rounded-md border-input bg-transparent p-0"
                value={primary}
                onChange={(event) => onUpdate({ ...settings, primary_color: event.target.value })}
              />
              <Input
                id={colorTextId}
                type="text"
                aria-label="Primary color hex value"
                className="app-input-soft h-auto flex-1 py-3 font-mono"
                value={primary}
                onChange={(event) => onUpdate({ ...settings, primary_color: event.target.value })}
              />
            </div>
          </div>
          <Button type="button" onClick={onSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save brand"}
          </Button>
        </div>

        <div
          className="flex flex-col justify-center rounded-xl border border-border p-5"
          style={{
            background: `color-mix(in srgb, ${primary} 10%, var(--wireline-color-surface-default))`,
          }}
        >
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Preview
          </p>
          <div className="mt-4 rounded-xl border border-border bg-card p-5 shadow-[var(--wireline-elevation-sm)]">
            <div className="flex items-center gap-3">
              {settings.brand_logo_url ? (
                <img
                  src={settings.brand_logo_url}
                  alt=""
                  className="size-8 object-contain"
                  loading="lazy"
                  decoding="async"
                  width={32}
                  height={32}
                />
              ) : (
                <span
                  className="grid size-8 place-items-center rounded-lg text-sm font-semibold text-primary-foreground"
                  style={{ background: primary }}
                  aria-hidden="true"
                >
                  {name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="font-[var(--wireline-font-family-display)] text-lg tracking-[-0.02em] text-foreground">
                {name}
              </span>
            </div>
            <div className="mt-5 space-y-2">
              <div className="h-2 w-full rounded-full bg-muted" />
              <div className="h-2 w-2/3 rounded-full bg-muted" />
            </div>
            <div className="mt-6 flex justify-end">
              <span
                className="inline-flex min-h-9 items-center rounded-md px-3.5 text-sm font-semibold text-primary-foreground"
                style={{ background: primary }}
              >
                Action
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
