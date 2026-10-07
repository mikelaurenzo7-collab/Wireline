import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WorkspaceBrandingSettings from "../src/components/settings/WorkspaceBrandingSettings";
import WorkspaceBrandEditor, {
  type WorkspaceBrandForm,
} from "../src/components/settings/WorkspaceBrandEditor";

const h = vi.hoisted(() => ({
  slots: [] as Array<{ value?: unknown; deps?: readonly unknown[] }>,
  cursor: 0,
  effects: [] as Array<() => void>,
  loading: false,
  saving: false,
  saveDraft: null as WorkspaceBrandForm | null,
  saveError: null as string | null,
  brand: { brand_name: "Saved name", brand_logo_url: "", primary_color: "#A78BFA" },
  fetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  update: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const slot = (h.slots[h.cursor++] ??= { value: initial });
    return [
      slot.value,
      (value: unknown) => {
        slot.value = typeof value === "function" ? value(slot.value) : value;
      },
    ];
  },
  useRef(initial: unknown) {
    return (h.slots[h.cursor++] ??= { value: { current: initial } }).value;
  },
  useEffect(callback: () => void, deps: readonly unknown[]) {
    const slot = (h.slots[h.cursor++] ??= {});
    if (!slot.deps || deps.some((value, i) => !Object.is(value, slot.deps?.[i]))) {
      slot.deps = deps;
      h.effects.push(callback);
    }
  },
}));
vi.mock("../src/contexts/BrandingContext", () => ({
  useBranding: () => ({
    branding: h.brand,
    isLoading: h.loading,
    isSaving: h.saving,
    saveDraft: h.saveDraft,
    saveError: h.saveError,
    updateBranding: h.update,
    beginBrandingSave: (draft: WorkspaceBrandForm) => {
      if (h.saving || h.loading) return null;
      h.saving = true;
      h.saveDraft = { ...draft };
      h.saveError = null;
      return (error: string | null) => {
        h.saving = false;
        h.saveError = error;
        if (!error) h.saveDraft = null;
      };
    },
  }),
}));
vi.mock("../src/contexts/ToastContext", () => ({
  useToast: () => ({ success: h.success, error: h.error }),
}));
vi.mock("../src/lib/api", () => ({
  authFetch: h.fetch,
  safeJson: (r: Response) => r.json().catch(() => null),
}));

function render() {
  h.cursor = 0;
  const element = WorkspaceBrandingSettings();
  h.effects.splice(0).forEach((effect) => effect());
  return element.props as {
    settings: WorkspaceBrandForm;
    onUpdate: (next: WorkspaceBrandForm) => void;
    onSave: () => void;
    isSaving: boolean;
    isLoading: boolean;
    saveError: string | null;
  };
}
async function settle() {
  for (let i = 0; i < 30; i++) {
    await Promise.resolve();
    render();
  }
}
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  h.slots = [];
  h.cursor = 0;
  h.effects = [];
  h.loading = false;
  h.saving = false;
  h.saveDraft = null;
  h.saveError = null;
  h.brand = { brand_name: "Saved name", brand_logo_url: "", primary_color: "#A78BFA" };
  h.fetch.mockReset();
  h.success.mockReset();
  h.error.mockReset();
  h.update.mockReset().mockImplementation((next: WorkspaceBrandForm) => {
    h.brand = { ...next };
  });
});
describe("workspace branding draft recovery", () => {
  it("inherits the pending save lock after leaving and reopening Appearance", async () => {
    render();
    const draft = { ...render().settings, brand_name: "Submitted before tab change" };
    render().onUpdate(draft);
    let finish!: (value: Response) => void;
    h.fetch.mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          finish = done;
        }),
    );
    render().onSave();
    h.slots = [];
    h.effects = [];
    render();
    const reopened = render();
    expect(reopened.isSaving).toBe(true);
    reopened.onUpdate({ ...reopened.settings, brand_name: "Blocked overlapping draft" });
    reopened.onSave();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(render().settings).toEqual(draft);
    finish(response({ success: true }));
    await settle();
    expect(render().isSaving).toBe(false);
    expect(render().settings).toEqual(draft);
    render().onUpdate({ ...draft, brand_name: "Next valid draft" });
    expect(render().settings.brand_name).toBe("Next valid draft");
  });
  it.each(["before", "after"])(
    "restores the submitted draft when Appearance reopens %s the pending save fails",
    async (reopen) => {
      render();
      const draft = {
        brand_name: "Submitted before navigation",
        brand_logo_url: "https://assets.example.test/brand.png",
        primary_color: "#334455",
      };
      render().onUpdate(draft);
      let finish!: (value: Response) => void;
      h.fetch.mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            finish = done;
          }),
      );
      render().onSave();
      h.slots = [];
      h.effects = [];
      if (reopen === "before") {
        render();
        expect(render().settings).toEqual(draft);
        expect(render().isSaving).toBe(true);
      }
      finish(response({ error: "Please retry later." }, 503));
      for (let i = 0; i < 30; i++) await Promise.resolve();
      render();
      const recovered = render();
      expect(recovered.settings).toEqual(draft);
      expect(recovered.isSaving).toBe(false);
      expect(recovered.saveError).toBe("Please retry later.");
      expect(h.brand.brand_name).toBe("Saved name");
      expect(h.update).not.toHaveBeenCalled();
      h.fetch.mockResolvedValueOnce(response({ success: true }));
      recovered.onSave();
      await settle();
      expect(h.fetch.mock.calls[1][1].body).toBe(JSON.stringify(draft));
      expect(render().settings).toEqual(draft);
      expect(render().saveError).toBeNull();
      expect(h.brand).toEqual(draft);
    },
  );
  it("blocks edits and saves until initial saved branding is loaded", () => {
    h.loading = true;
    const pending = render();
    expect(pending.isLoading).toBe(true);
    pending.onUpdate({ ...pending.settings, brand_name: "Premature draft" });
    pending.onSave();
    expect(h.fetch).not.toHaveBeenCalled();
    h.loading = false;
    render();
    expect(render().settings.brand_name).toBe("Saved name");
  });
  it.each([true, false])(
    "keeps pending branding locked and retains retry after success=%s",
    async (success) => {
      render();
      const draft = { ...render().settings, brand_name: "Intended draft" };
      render().onUpdate(draft);
      let finish!: (r: Response) => void;
      h.fetch.mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            finish = done;
          }),
      );
      render().onSave();
      const pending = render();
      expect(pending.isSaving).toBe(true);
      pending.onUpdate({ ...draft, brand_name: "Unaccepted later edit" });
      pending.onSave();
      expect(h.fetch).toHaveBeenCalledOnce();
      expect(render().settings).toEqual(draft);
      finish(success ? response({ success: true }) : response({ error: "Please retry." }, 503));
      await settle();
      expect(render().settings).toEqual(draft);
      expect(render().isSaving).toBe(false);
      if (success) expect(h.success).toHaveBeenCalledOnce();
      else {
        expect(h.success).not.toHaveBeenCalled();
        h.fetch.mockResolvedValueOnce(response({ success: true }));
        render().onSave();
        await settle();
        expect(h.fetch.mock.calls[1][1].body).toBe(JSON.stringify(draft));
        expect(h.success).toHaveBeenCalledOnce();
      }
    },
  );
  it.each(["loading", "saving"])("disables the actual fieldset while %s", (state) => {
    const html = renderToStaticMarkup(
      <WorkspaceBrandEditor
        settings={h.brand}
        onUpdate={() => {}}
        onSave={() => {}}
        isSaving={state === "saving"}
        isLoading={state === "loading"}
      />,
    );
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain(state === "saving" ? "Saving…" : "Loading…");
  });
  it("keeps a failed save visible beside the retry control after returning", () => {
    const html = renderToStaticMarkup(
      <WorkspaceBrandEditor
        settings={h.brand}
        onUpdate={() => {}}
        onSave={() => {}}
        saveError="Please retry later."
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Please retry later. Your changes are kept. Try again.");
    expect(html).toContain("Save Branding");
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
  });
});
