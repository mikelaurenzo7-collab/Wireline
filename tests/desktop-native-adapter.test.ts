import { describe, expect, it, vi } from "vitest";
import {
  createNativeAdapter,
  nativeCaptureWindowId,
  validateNativeAction,
  validateNativeWindow,
  type NativeHelperRequest,
  type NativeWindow,
} from "../apps/desktop/src/native";

const window: NativeWindow = {
  id: "1234:4321:638950000000000000",
  processId: 4321,
  title: "Example document",
  appName: "Editor",
  bounds: { x: -1200, y: 40, width: 1000, height: 800 },
  scaleFactor: 2,
};
// Header-only PNG fixture is sufficient for the adapter's bounded header validation.
// This test never captures the screen, spawns a helper or injects native input.
function screenshot(width = 500, height = 400, variant = 0) {
  const bytes = Buffer.alloc(25);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes[24] = variant;
  return { mimeType: "image/png" as const, data: bytes.toString("base64"), width, height };
}
function setup() {
  const runHelper = vi.fn(async (request: NativeHelperRequest) =>
    request.operation === "list"
      ? { status: "ok", windows: [window] }
      : request.operation === "inspect"
        ? { status: "ok", window, foreground: true }
        : { status: request.operation === "activate" ? "ok" : "applied" },
  );
  const captureWindow = vi.fn(async () => screenshot());
  const adapter = createNativeAdapter({ platform: "win32", runHelper, captureWindow });
  return { adapter, runHelper, captureWindow };
}
const writes = (mock: ReturnType<typeof setup>["runHelper"]) =>
  mock.mock.calls.filter(([request]) => request.operation === "execute");

describe("macOS Accessibility recovery", () => {
  const denied = {
    status: "rejected",
    code: "accessibility_required",
    message: "private native diagnostic must not be shown",
  };
  it("shows bounded permission guidance for denied window listing and observation", async () => {
    const captureWindow = vi.fn(async () => screenshot());
    const runHelper = vi.fn(async () => denied);
    const adapter = createNativeAdapter({ platform: "darwin", runHelper, captureWindow });
    for (const operation of [() => adapter.listWindows(), () => adapter.observe(window.id)]) {
      await expect(operation()).rejects.toThrow(
        "Enable Accessibility access for BotBound Desktop and its native helper in macOS System Settings, then restart the app and refresh windows.",
      );
    }
    expect(captureWindow).not.toHaveBeenCalled();
    expect(runHelper.mock.calls).toHaveLength(2);
  });
  it("preserves permission guidance when access is revoked before or at input", async () => {
    for (const deniedOperation of ["inspect", "activate", "execute"]) {
      const runHelper = vi.fn(async (request: NativeHelperRequest) =>
        request.operation === deniedOperation ? denied : { status: "ok", window, foreground: true },
      );
      const adapter = createNativeAdapter({
        platform: "darwin",
        runHelper,
        captureWindow: async () => screenshot(),
      });
      const observation = createNativeAdapter({
        platform: "darwin",
        runHelper: async () => ({ status: "ok", window, foreground: true }),
        captureWindow: async () => screenshot(),
      });
      const before = await observation.observe(window.id);
      const result = await adapter.execute(window.id, before.fingerprint, {
        type: "type_text",
        text: "hello",
      });
      expect(result.status).toBe("rejected");
      expect(result.message).toContain("Enable Accessibility access");
      expect(result.message).not.toContain("private");
      expect(
        runHelper.mock.calls.filter(([request]) => request.operation === "execute"),
      ).toHaveLength(deniedOperation === "execute" ? 1 : 0);
    }
  });
  it("does not expose arbitrary helper codes or apply Mac guidance to Windows", async () => {
    for (const [platform, code] of [
      ["darwin", "private diagnostic"],
      ["win32", "accessibility_required"],
    ] as const) {
      const adapter = createNativeAdapter({
        platform,
        runHelper: async () => ({ ...denied, code }),
        captureWindow: async () => screenshot(),
      });
      await expect(adapter.listWindows()).rejects.toThrow("Native window list unavailable.");
      await expect(adapter.observe(window.id)).rejects.toThrow(
        "The selected window is unavailable or cannot be shared safely.",
      );
    }
  });
});

describe("native action validation", () => {
  it("normalizes planner aliases without enabling Windows/system switching keys", () => {
    expect(
      validateNativeAction({ type: "keypress", keys: ["Control", "ArrowUp"] }, undefined, "win32"),
    ).toEqual({
      type: "keypress",
      keys: ["CTRL", "UP"],
    });
    expect(
      validateNativeAction({ type: "keypress", keys: ["Meta", "c"] }, undefined, "darwin"),
    ).toEqual({
      type: "keypress",
      keys: ["COMMAND", "C"],
    });
    for (const keys of [
      ["WIN", "R"],
      ["Alt", "Tab"],
      ["Meta", "Space"],
      ["Control", "Alt", "Delete"],
      ["CTRL"],
      ["A", "CTRL"],
      ["Control", "CTRL", "A"],
      ["Meta", "C"],
    ]) {
      expect(() => validateNativeAction({ type: "keypress", keys })).toThrow();
    }
    expect(() =>
      validateNativeAction({ type: "keypress", keys: ["Meta", "C"] }, undefined, "win32"),
    ).toThrow();
    expect(validateNativeAction({ type: "keypress", keys: ["Enter"] })).toEqual({
      type: "keypress",
      keys: ["ENTER"],
    });
  });
  it("rejects scripts, extra properties, hidden control characters and out-of-frame coordinates", () => {
    for (const action of [
      { type: "exec", script: "anything" },
      { type: "type_text", text: "safe", script: "anything" },
      { type: "type_text", text: "secret\tSubmit" },
      { type: "type_text", text: "a".repeat(2001) },
      { type: "click", x: 500, y: 1, button: "left", clickCount: 1 },
      { type: "click", x: 1.5, y: 1, button: "left", clickCount: 1 },
      { type: "scroll", x: 2, y: 2, deltaX: 0, deltaY: 0 },
    ])
      expect(() => validateNativeAction(action, { width: 500, height: 400 })).toThrow();
    expect(validateNativeAction({ type: "type_text", text: "A note\nSecond line 😀" }).type).toBe(
      "type_text",
    );
  });
  it("binds window handle to its process instance and rejects invalid geometry", () => {
    expect(nativeCaptureWindowId(window.id)).toBe("1234");
    expect(validateNativeWindow(window)).toEqual(window);
    expect(() => validateNativeWindow({ ...window, processId: 1 })).toThrow();
    expect(() =>
      validateNativeWindow({ ...window, bounds: { ...window.bounds, width: Infinity } }),
    ).toThrow();
    for (const id of ["0:1:1", "1:0:1", "1:1:0", "1:2", "1:2:3/path", "window:12:0"])
      expect(() => nativeCaptureWindowId(id)).toThrow();
  });
  it("rejects known launcher, desktop-switch and executable URL inputs", () => {
    for (const keys of [
      ["Control", "Escape"],
      ["Alt", "Escape"],
      ["Control", "Shift", "Escape"],
      ["Meta", "H"],
      ["Meta", "M"],
      ["Meta", "Q"],
    ]) {
      expect(() => validateNativeAction({ type: "keypress", keys })).toThrow();
    }
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      expect(() =>
        validateNativeAction({ type: "keypress", keys: ["Control", key] }, undefined, "darwin"),
      ).toThrow();
    }
    expect(
      validateNativeAction(
        { type: "keypress", keys: ["Control", "ArrowLeft"] },
        undefined,
        "win32",
      ),
    ).toEqual({ type: "keypress", keys: ["CTRL", "LEFT"] });
    for (const text of [
      "javascript:alert(1)",
      "\n JaVaScRiPt:location='x'",
      "data:text/html,<script>",
      "file:///C:/Windows/System32/cmd.exe",
      "shell:AppsFolder",
      "powershell:run",
      "cmd:run",
      "ms-settings:privacy",
    ]) {
      expect(() => validateNativeAction({ type: "type_text", text })).toThrow();
    }
    expect(
      validateNativeAction({ type: "type_text", text: "https://botbound.app/calendar" }),
    ).toEqual({ type: "type_text", text: "https://botbound.app/calendar" });
  });
});

describe("native window observation and execution", () => {
  it("rejects focus-triggered pixel changes before dispatching the approved action", async () => {
    const { adapter, runHelper, captureWindow } = setup();
    const before = await adapter.observe(window.id);
    runHelper.mockImplementation(async (request) => {
      if (request.operation === "activate")
        captureWindow.mockResolvedValue(screenshot(500, 400, 1));
      return { status: "ok", window, foreground: true };
    });
    const result = await adapter.execute(window.id, before.fingerprint, {
      type: "type_text",
      text: "Reviewed text",
    });
    expect(result).toMatchObject({ status: "rejected" });
    expect(captureWindow).toHaveBeenCalledTimes(2);
    expect(writes(runHelper)).toHaveLength(0);
  });
  it("activates before the final capture and executes only while foreground identity is retained", async () => {
    const { adapter, runHelper, captureWindow } = setup();
    const before = await adapter.observe(window.id);
    const operations: string[] = [];
    runHelper.mockImplementation(async (request) => {
      operations.push(request.operation);
      return {
        status: request.operation === "execute" ? "applied" : "ok",
        window,
        foreground: true,
      };
    });
    captureWindow.mockImplementation(async () => {
      operations.push("capture");
      return screenshot();
    });
    expect(
      await adapter.execute(window.id, before.fingerprint, {
        type: "type_text",
        text: "Reviewed text",
      }),
    ).toMatchObject({ status: "applied" });
    expect(operations).toEqual(["inspect", "activate", "inspect", "capture", "inspect", "execute"]);
  });
  it.each(["activation denied", "focus lost after capture"])(
    "does not dispatch when %s",
    async (failure) => {
      const { adapter, runHelper, captureWindow } = setup();
      const before = await adapter.observe(window.id);
      let captured = false;
      captureWindow.mockImplementation(async () => {
        captured = true;
        return screenshot();
      });
      runHelper.mockImplementation(async (request) => ({
        status:
          failure === "activation denied" && request.operation === "activate" ? "rejected" : "ok",
        window,
        foreground: !captured,
      }));
      expect(
        await adapter.execute(window.id, before.fingerprint, {
          type: "type_text",
          text: "Reviewed text",
        }),
      ).toMatchObject({ status: "rejected" });
      expect(writes(runHelper)).toHaveLength(0);
    },
  );
  it("captures only the selected foreground window and verifies identity again after capture", async () => {
    const { adapter, captureWindow, runHelper } = setup();
    const observation = await adapter.observe(window.id);
    expect(captureWindow).toHaveBeenCalledWith(window, undefined);
    expect(runHelper.mock.calls.map(([request]) => request.operation)).toEqual([
      "inspect",
      "activate",
      "inspect",
      "inspect",
    ]);
    expect(observation.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(writes(runHelper)).toHaveLength(0);
  });
  it("rejects a recycled handle or a moving window during capture", async () => {
    for (const changed of [
      { ...window, id: "1234:4321:638950000000000001" },
      { ...window, bounds: { ...window.bounds, x: 1 } },
    ]) {
      const { adapter, runHelper } = setup();
      runHelper
        .mockResolvedValueOnce({ status: "ok", window, foreground: true })
        .mockResolvedValueOnce({ status: "ok" })
        .mockResolvedValueOnce({ status: "ok", window, foreground: true })
        .mockResolvedValueOnce({ status: "ok", window: changed, foreground: true });
      await expect(adapter.observe(window.id)).rejects.toThrow();
      expect(writes(runHelper)).toHaveLength(0);
    }
  });
  it("rejects malformed or incorrectly sized capture before any input", async () => {
    const { adapter, captureWindow, runHelper } = setup();
    captureWindow.mockResolvedValueOnce({ ...screenshot(), width: 800 });
    await expect(adapter.observe(window.id)).rejects.toThrow("Invalid window capture");
    expect(writes(runHelper)).toHaveLength(0);
  });
  it("rejects changed pixels rather than clicking from stale model observations", async () => {
    const { adapter, captureWindow, runHelper } = setup();
    const before = await adapter.observe(window.id);
    captureWindow.mockResolvedValue(screenshot(500, 400, 1));
    expect(
      await adapter.execute(window.id, before.fingerprint, {
        type: "click",
        x: 1,
        y: 1,
        button: "left",
        clickCount: 1,
      }),
    ).toMatchObject({ status: "rejected" });
    expect(writes(runHelper)).toHaveLength(0);
  });
  it("maps screenshot pixels to native window coordinates and keeps expected identity", async () => {
    const { adapter, runHelper } = setup();
    const before = await adapter.observe(window.id);
    expect(
      await adapter.execute(window.id, before.fingerprint, {
        type: "click",
        x: 250,
        y: 399,
        button: "left",
        clickCount: 2,
      }),
    ).toMatchObject({ status: "applied" });
    expect(writes(runHelper)).toEqual([
      [
        {
          version: 1,
          operation: "execute",
          windowId: window.id,
          expectedWindow: window,
          action: { type: "click", x: 500, y: 798, button: "left", clickCount: 2 },
        },
        undefined,
      ],
    ]);
  });
  it("does not start input after cancellation or invalid Windows meta key", async () => {
    const { adapter, runHelper } = setup();
    const before = await adapter.observe(window.id);
    const controller = new AbortController();
    controller.abort();
    expect(
      await adapter.execute(
        window.id,
        before.fingerprint,
        { type: "type_text", text: "hello" },
        controller.signal,
      ),
    ).toMatchObject({ status: "rejected" });
    expect(
      await adapter.execute(window.id, before.fingerprint, {
        type: "keypress",
        keys: ["Meta", "A"],
      }),
    ).toMatchObject({ status: "rejected" });
    expect(writes(runHelper)).toHaveLength(0);
  });
  it("retains unknown outcome after helper failure and never retries the write", async () => {
    const { adapter, runHelper } = setup();
    const before = await adapter.observe(window.id);
    runHelper.mockImplementation(async (request) => {
      if (request.operation === "execute") throw new Error("private native failure");
      return { status: "ok", window, foreground: true };
    });
    const result = await adapter.execute(window.id, before.fingerprint, {
      type: "type_text",
      text: "hello",
    });
    expect(result.status).toBe("unknown");
    expect(result.message).not.toContain("private");
    expect(writes(runHelper)).toHaveLength(1);
  });
  it("preserves native rejection and treats an unrecognized success response as unknown", async () => {
    for (const [reply, expected] of [
      [{ status: "rejected", message: "raw sensitive error" }, "rejected"],
      [{ ok: true }, "unknown"],
    ] as const) {
      const { adapter, runHelper } = setup();
      const before = await adapter.observe(window.id);
      runHelper.mockImplementation(async (request) =>
        request.operation === "execute" ? reply : { status: "ok", window, foreground: true },
      );
      const result = await adapter.execute(window.id, before.fingerprint, {
        type: "type_text",
        text: "hello",
      });
      expect(result.status).toBe(expected);
      expect(result.message).not.toContain("raw sensitive");
    }
  });
  it("prevents concurrent input while the first helper outcome is unresolved", async () => {
    const { adapter, runHelper } = setup();
    const before = await adapter.observe(window.id);
    let finish!: (value: { status: string }) => void;
    runHelper.mockImplementation(async (request) =>
      request.operation === "execute"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { status: "ok", window, foreground: true },
    );
    const first = adapter.execute(window.id, before.fingerprint, {
      type: "type_text",
      text: "one",
    });
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(
      await adapter.execute(window.id, before.fingerprint, { type: "type_text", text: "two" }),
    ).toMatchObject({ status: "rejected" });
    finish({ status: "applied" });
    expect(await first).toMatchObject({ status: "applied" });
    expect(writes(runHelper)).toHaveLength(1);
  });
});
