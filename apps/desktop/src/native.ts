import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  validateComputerNativeAction,
  type ComputerNativeAction,
} from "../../../src/lib/computer-native-action";

export type NativeWindow = {
  id: string;
  title: string;
  appName: string;
  processId: number;
  bounds: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
};
export type NativeScreenshot = {
  mimeType: "image/png";
  data: string;
  width: number;
  height: number;
};
export type NativeObservation = {
  window: NativeWindow;
  screenshot: NativeScreenshot;
  fingerprint: string;
};
export type NativeAction = ComputerNativeAction;
export type NativeExecutionResult = {
  status: "applied" | "rejected" | "unknown";
  message: string;
};
export type NativeAdapter = {
  listWindows(signal?: AbortSignal): Promise<NativeWindow[]>;
  observe(windowId: string, signal?: AbortSignal): Promise<NativeObservation>;
  execute(
    windowId: string,
    expectedObservationFingerprint: string,
    action: NativeAction,
    signal?: AbortSignal,
  ): Promise<NativeExecutionResult>;
};
export type NativeHelperRequest = {
  version: 1;
  operation: "list" | "inspect" | "activate" | "execute" | "release";
  windowId?: string;
  expectedWindow?: NativeWindow;
  action?: NativeAction;
};
export type NativeHelperRunner = (
  request: NativeHelperRequest,
  signal?: AbortSignal,
) => Promise<unknown>;

const ID = /^(\d{1,20}):(\d{1,10}):(\d{1,20})$/;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_HELPER_OUTPUT_BYTES = 1024 * 1024;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid native response.");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max && !value.includes("\0");
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Native operation cancelled.");
}

/** The remaining id components bind a recycled handle to its owning process instance. */
export function nativeCaptureWindowId(windowId: string): string {
  const match = ID.exec(windowId);
  if (!match || BigInt(match[1]) <= 0n || BigInt(match[2]) <= 0n || BigInt(match[3]) <= 0n) {
    throw new Error("Invalid native window identity.");
  }
  return match[1];
}

export function validateNativeWindow(value: unknown): NativeWindow {
  const row = record(value);
  const bounds = record(row.bounds);
  if (!text(row.id, 64)) throw new Error("Invalid native window identity.");
  nativeCaptureWindowId(row.id);
  if (
    !text(row.title, 500) ||
    !text(row.appName, 200) ||
    !integer(row.processId, 1, 2147483647) ||
    row.id.split(":")[1] !== String(row.processId) ||
    !integer(bounds.x, -100000, 100000) ||
    !integer(bounds.y, -100000, 100000) ||
    !integer(bounds.width, 1, 16384) ||
    !integer(bounds.height, 1, 16384) ||
    typeof row.scaleFactor !== "number" ||
    !Number.isFinite(row.scaleFactor) ||
    row.scaleFactor < 0.5 ||
    row.scaleFactor > 8
  ) {
    throw new Error("Invalid native window geometry.");
  }
  return {
    id: row.id,
    title: row.title,
    appName: row.appName,
    processId: row.processId,
    bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
    scaleFactor: row.scaleFactor,
  };
}

/** Coordinates use pixels in the returned screenshot, not physical display coordinates. */
export function validateNativeAction(
  value: unknown,
  screenshot?: Pick<NativeScreenshot, "width" | "height">,
  platform?: "win32" | "darwin",
): NativeAction {
  return validateComputerNativeAction(
    value,
    screenshot,
    platform === "win32" ? "windows" : platform === "darwin" ? "macos" : undefined,
  );
}

function validateScreenshot(value: NativeScreenshot): NativeScreenshot {
  if (
    value.mimeType !== "image/png" ||
    !integer(value.width, 1, 16384) ||
    !integer(value.height, 1, 16384) ||
    value.width * value.height > 40_000_000 ||
    typeof value.data !== "string" ||
    value.data.length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
  )
    throw new Error("Invalid window capture.");
  const png = Buffer.from(value.data, "base64");
  if (
    png.length < 24 ||
    png.length > MAX_SCREENSHOT_BYTES ||
    png.toString("base64") !== value.data ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.toString("ascii", 12, 16) !== "IHDR" ||
    png.readUInt32BE(16) !== value.width ||
    png.readUInt32BE(20) !== value.height
  )
    throw new Error("Invalid window capture.");
  return { mimeType: "image/png", data: value.data, width: value.width, height: value.height };
}

function defaultHelperPath(platform: "win32" | "darwin"): string {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) throw new Error("Development must provide an absolute native helper path.");
  return resolve(
    resourcesPath,
    "native",
    platform,
    platform === "win32" ? "BotBound.Native.exe" : "BotBound.Native",
  );
}

/** Helpers accept one bounded JSON document over stdin; no caller-controlled executable or shell. */
export function createNativeHelperRunner(helperPath: string): NativeHelperRunner {
  const invoke = (request: NativeHelperRequest, signal?: AbortSignal): Promise<unknown> =>
    new Promise((resolveResult, reject) => {
      if (signal?.aborted) {
        reject(new Error("Native operation cancelled."));
        return;
      }
      const child = spawn(helperPath, [], {
        shell: false,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      let settled = false;
      let closed = false;
      const finish = (error?: Error, value?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        if (error) {
          const afterClose = closed
            ? Promise.resolve()
            : new Promise<void>((done) => child.once("close", done));
          if (!closed) {
            try {
              child.kill("SIGKILL");
            } catch {
              /* Keep execution fenced until actual exit. */
            }
          }
          // A killed helper cannot run finally. A separate fixed helper may only release
          // this action's keys/button, never replay the write or move the pointer.
          void afterClose
            .then(() =>
              request.operation === "execute" && request.action && child.pid
                ? invoke({ version: 1, operation: "release", action: request.action })
                : undefined,
            )
            .catch(() => undefined)
            .finally(() => reject(error));
        } else resolveResult(value);
      };
      const cancel = () => finish(new Error("Native operation cancelled."));
      const timer = setTimeout(
        () => finish(new Error("Native operation timed out.")),
        request.operation === "release" ? 1500 : 8000,
      );
      signal?.addEventListener("abort", cancel, { once: true });
      child.on("error", () => finish(new Error("Native helper unavailable.")));
      child.stdin.on("error", () => finish(new Error("Native helper input failed.")));
      child.stderr.resume(); // Never surface native exception strings or application data.
      child.stdout.on("data", (chunk: Buffer) => {
        if (settled) return;
        output += chunk.toString("utf8");
        if (Buffer.byteLength(output, "utf8") > MAX_HELPER_OUTPUT_BYTES)
          finish(new Error("Native response exceeded its limit."));
      });
      child.on("close", (code) => {
        closed = true;
        if (settled) return;
        if (code !== 0) {
          finish(new Error("Native helper failed."));
          return;
        }
        try {
          finish(undefined, JSON.parse(output));
        } catch {
          finish(new Error("Invalid native response."));
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
  return invoke;
}

class NativeAccessibilityRequiredError extends Error {
  constructor() {
    super(
      "Enable Accessibility access for BotBound Desktop and its native helper in macOS System Settings, then restart the app and refresh windows.",
    );
  }
}

export function createNativeAdapter(options: {
  captureWindow: (window: NativeWindow, signal?: AbortSignal) => Promise<NativeScreenshot>;
  helperPath?: string;
  platform?: "win32" | "darwin";
  /** Dependency injection for hermetic tests; production uses the packaged helper only. */
  runHelper?: NativeHelperRunner;
}): NativeAdapter {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32" && platform !== "darwin")
    throw new Error("This computer platform is not supported.");
  const run =
    options.runHelper ??
    createNativeHelperRunner(options.helperPath ?? defaultHelperPath(platform));
  const accessibilityRequired = (reply: Record<string, unknown>) =>
    platform === "darwin" && reply.status === "rejected" && reply.code === "accessibility_required";
  let executing = false;
  const inspect = async (windowId: string, signal?: AbortSignal, requireForeground = false) => {
    aborted(signal);
    nativeCaptureWindowId(windowId);
    const reply = record(await run({ version: 1, operation: "inspect", windowId }, signal));
    if (accessibilityRequired(reply)) throw new NativeAccessibilityRequiredError();
    if (reply.status !== "ok")
      throw new Error("The selected window is unavailable or cannot be shared safely.");
    if (requireForeground && reply.foreground !== true)
      throw new Error("The selected window lost focus. Observe it again before acting.");
    const window = validateNativeWindow(reply.window);
    if (window.id !== windowId) throw new Error("The selected window has changed.");
    return window;
  };
  const observe: NativeAdapter["observe"] = async (windowId, signal) => {
    const target = await inspect(windowId, signal);
    const activation = record(
      await run({ version: 1, operation: "activate", windowId, expectedWindow: target }, signal),
    );
    if (accessibilityRequired(activation)) throw new NativeAccessibilityRequiredError();
    if (activation.status !== "ok")
      throw new Error("The selected window could not be activated safely.");
    // Both the proposal and pre-input observation use a focused window. Otherwise
    // ordinary active/inactive title-bar changes would reject every approval.
    const window = await inspect(windowId, signal, true);
    aborted(signal);
    const screenshot = validateScreenshot(await options.captureWindow(window, signal));
    aborted(signal);
    const current = await inspect(windowId, signal, true);
    if (JSON.stringify(current) !== JSON.stringify(window))
      throw new Error("The selected window changed during capture. Observe it again.");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(window))
      .update(Buffer.from(screenshot.data, "base64"))
      .digest("hex");
    return { window, screenshot, fingerprint };
  };
  return {
    async listWindows(signal) {
      aborted(signal);
      const reply = record(await run({ version: 1, operation: "list" }, signal));
      if (accessibilityRequired(reply)) throw new NativeAccessibilityRequiredError();
      if (reply.status !== "ok" || !Array.isArray(reply.windows) || reply.windows.length > 200)
        throw new Error("Native window list unavailable.");
      return reply.windows.map(validateNativeWindow);
    },
    observe,
    async execute(windowId, expectedObservationFingerprint, action, signal) {
      if (executing)
        return { status: "rejected", message: "Another computer action is still running." };
      executing = true;
      let invoked = false;
      try {
        aborted(signal);
        if (!/^[a-f0-9]{64}$/.test(expectedObservationFingerprint))
          throw new Error("Invalid observation fingerprint.");
        const validAction = validateNativeAction(action, undefined, platform);
        // Focus handlers can change controls. Only compare the approved pixels
        // after activation; execute must reject a subsequent focus loss itself.
        const current = await observe(windowId, signal);
        if (current.fingerprint !== expectedObservationFingerprint)
          return {
            status: "rejected",
            message: "The window changed. Observe it again before acting.",
          };
        validateNativeAction(validAction, current.screenshot, platform);
        const nativeAction =
          validAction.type === "click" || validAction.type === "scroll"
            ? {
                ...validAction,
                x: Math.min(
                  current.window.bounds.width - 1,
                  Math.floor(
                    (validAction.x * current.window.bounds.width) / current.screenshot.width,
                  ),
                ),
                y: Math.min(
                  current.window.bounds.height - 1,
                  Math.floor(
                    (validAction.y * current.window.bounds.height) / current.screenshot.height,
                  ),
                ),
              }
            : validAction;
        aborted(signal);
        invoked = true;
        const reply = record(
          await run(
            {
              version: 1,
              operation: "execute",
              windowId,
              expectedWindow: current.window,
              action: nativeAction,
            },
            signal,
          ),
        );
        if (reply.status !== "applied" && reply.status !== "rejected" && reply.status !== "unknown")
          throw new Error("Invalid action result.");
        return {
          status: reply.status,
          message:
            reply.status === "applied"
              ? "Input was applied. Observe the window to verify the result."
              : reply.status === "rejected"
                ? accessibilityRequired(reply)
                  ? new NativeAccessibilityRequiredError().message
                  : "The window or input target no longer met the task's safety conditions. No input was applied."
                : "The input outcome is unknown. Review the window before continuing; do not repeat the action automatically.",
        };
      } catch (error) {
        return invoked
          ? {
              status: "unknown",
              message:
                "The input outcome is unknown. Review the window before continuing; do not repeat the action automatically.",
            }
          : {
              status: "rejected",
              message:
                error instanceof NativeAccessibilityRequiredError
                  ? error.message
                  : "The action was stopped before input. Refresh the observation and review the task.",
            };
      } finally {
        executing = false;
      }
    },
  };
}
