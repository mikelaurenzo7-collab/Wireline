import { describe, expect, it } from "vitest";
import { MAX_VISIBLE_TOASTS, mergeToastQueue, type Toast } from "./ToastContext";

const makeToast = (overrides: Partial<Toast> = {}): Toast => ({
  id: overrides.id ?? "toast-1",
  type: overrides.type ?? "info",
  title: overrides.title ?? "Title",
  message: overrides.message,
  duration: overrides.duration,
  action: overrides.action,
});

describe("mergeToastQueue", () => {
  it("deduplicates identical toasts by type, title, and message", () => {
    const existing = makeToast();
    const result = mergeToastQueue([existing], makeToast({ id: "toast-2" }));

    expect(result.queue).toEqual([existing]);
    expect(result.duplicateId).toBe(existing.id);
    expect(result.evictedIds).toEqual([]);
  });

  it("caps the visible queue and evicts the oldest toast first", () => {
    const queue = Array.from({ length: MAX_VISIBLE_TOASTS }, (_, index) =>
      makeToast({
        id: `toast-${index + 1}`,
        title: `Toast ${index + 1}`,
      }),
    );

    const result = mergeToastQueue(
      queue,
      makeToast({
        id: "toast-4",
        title: "Toast 4",
      }),
    );

    expect(result.queue.map((toast) => toast.id)).toEqual(["toast-2", "toast-3", "toast-4"]);
    expect(result.evictedIds).toEqual(["toast-1"]);
  });
});
