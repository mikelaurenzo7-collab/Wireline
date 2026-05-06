// ToastContext tests — every user-facing success/error/warning message
// flows through this. Auto-dismiss timing, manual dismiss, and ID
// uniqueness are all surfaces a regression could quietly break.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./ToastContext";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ToastProvider>{children}</ToastProvider>
);

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("throws when used outside <ToastProvider>", () => {
    // Suppress React's error logging for this expected throw
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useToast())).toThrow(/inside <ToastProvider>/);
    spy.mockRestore();
  });

  it("starts with an empty toast list", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    expect(result.current.toasts).toEqual([]);
  });

  it("toast() appends a toast and returns its id", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: string | undefined;
    act(() => {
      id = result.current.toast({ type: "info", title: "Hello" });
    });
    expect(id).toBeDefined();
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({ id, type: "info", title: "Hello" });
  });

  it("auto-dismisses after the default 4500ms duration", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ type: "info", title: "Auto-dismiss" });
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("respects a custom duration", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ type: "info", title: "x", duration: 1000 });
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("duration: 0 keeps the toast persistent", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.toast({ type: "info", title: "Persistent", duration: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.toasts).toHaveLength(1);
  });

  it("dismiss() removes the toast immediately and clears its timer", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let id: string | undefined;
    act(() => {
      id = result.current.toast({ type: "info", title: "Dismiss me" });
    });
    act(() => {
      result.current.dismiss(id!);
    });
    expect(result.current.toasts).toHaveLength(0);

    // No "ghost" callback should fire when the timer would have completed.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("supports multiple toasts simultaneously", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success("Saved");
      result.current.error("Network error");
      result.current.warning("Slow API");
    });
    expect(result.current.toasts).toHaveLength(3);
  });

  it("error() defaults to 6000ms duration (longer than info)", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.error("Something failed");
    });
    act(() => {
      vi.advanceTimersByTime(4500);
    });
    // info would've been dismissed by now — error is still showing.
    expect(result.current.toasts).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("success/error/warning/info shortcuts set the correct type", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    act(() => {
      result.current.success("S");
      result.current.error("E");
      result.current.warning("W");
      result.current.info("I");
    });
    const types = result.current.toasts.map((t) => t.type);
    expect(types).toEqual(["success", "error", "warning", "info"]);
  });

  it("issues unique ids for each toast", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    const ids: string[] = [];
    act(() => {
      for (let i = 0; i < 5; i++) {
        ids.push(result.current.toast({ type: "info", title: `t${i}` }));
      }
    });
    expect(new Set(ids).size).toBe(5);
  });

  it("dismissing one toast does not affect the others", () => {
    const { result } = renderHook(() => useToast(), { wrapper });
    let firstId: string | undefined;
    act(() => {
      firstId = result.current.toast({ type: "info", title: "first" });
      result.current.toast({ type: "info", title: "second" });
    });
    act(() => {
      result.current.dismiss(firstId!);
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].title).toBe("second");
  });
});
