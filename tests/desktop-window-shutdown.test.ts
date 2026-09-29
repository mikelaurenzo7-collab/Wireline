import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import { DESKTOP_IPC } from "../apps/desktop/src/contracts";

const directory = resolve("apps/desktop/dist");
const compiled = buildSync({
  entryPoints: [resolve("apps/desktop/src/main.ts")],
  platform: "node",
  format: "cjs",
  bundle: false,
  write: false,
}).outputFiles[0].text;
const requireBuiltin = createRequire(import.meta.url);

function deferred() {
  let finish!: () => void;
  const promise = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

async function bootFixture(installerEvent = false) {
  const drain = deferred();
  const stopAndDrain = vi.fn(() => drain.promise);
  const oauth = {
    settleConnection: vi.fn(async () => undefined),
    requiresRecovery: vi.fn(() => false),
    requiresManualRecovery: vi.fn(() => false),
    disconnect: vi.fn(async () => undefined),
  };
  const handlers = new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>();
  const close = new Map<string, (event: { preventDefault(): void }) => void>();
  const webContents = {
    mainFrame: { url: pathToFileURL(resolve(directory, "renderer/index.html")).href },
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
    session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
  };
  const destroy = vi.fn();
  const quit = vi.fn();
  const electron = {
    app: {
      requestSingleInstanceLock: () => true,
      whenReady: () => Promise.resolve(),
      getPath: () => directory,
      on: vi.fn(),
      quit,
    },
    BrowserWindow: class {
      webContents = webContents;
      on(name: string, handler: (event: { preventDefault(): void }) => void) {
        close.set(name, handler);
      }
      loadFile = vi.fn(async () => undefined);
      isDestroyed = () => false;
      destroy = destroy;
    },
    ipcMain: {
      handle: (channel: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) =>
        handlers.set(channel, handler),
    },
    safeStorage: { isEncryptionAvailable: () => true },
    globalShortcut: { register: () => true, unregisterAll: vi.fn() },
    powerMonitor: { on: vi.fn() },
  };
  const dependencies: Record<string, unknown> = {
    electron,
    "electron-squirrel-startup": installerEvent,
    "./store": {
      DesktopStore: class {
        load = vi.fn(async () => undefined);
        read = () => ({ credential: null, servers: [], task: null });
      },
    },
    "./workspace-persistence": { createWorkspaceCommitter: () => undefined },
    "./oauth": {
      DesktopOAuth: class {
        constructor() {
          return oauth;
        }
      },
    },
    "./mcp-client": { McpClient: class {} },
    "./transport": {},
    "./native": { createNativeAdapter: () => ({}) },
    "./task-engine": {
      TaskEngine: class {
        stopAndDrain = stopAndDrain;
      },
    },
    "./contracts": { DESKTOP_IPC },
    "../../../src/lib/computer-protocol": { COMPUTER_LIMITS: {} },
  };
  runInNewContext(compiled, {
    __dirname: directory,
    process: { platform: "win32" },
    require: (name: string) => {
      if (name.startsWith("node:")) return requireBuiltin(name);
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected main dependency: ${name}`);
    },
  });
  if (!installerEvent) await vi.waitFor(() => expect(close.has("close")).toBe(true));
  return {
    booted: close.has("close"),
    drain,
    stopAndDrain,
    oauth,
    destroy,
    quit,
    webContents,
    close: () => {
      const event = { preventDefault: vi.fn() };
      close.get("close")!(event);
      return event;
    },
    invoke: (channel: string) =>
      handlers.get(channel)!({ sender: webContents, senderFrame: webContents.mainFrame }),
  };
}

describe("desktop window shutdown", () => {
  it("prevents repeated close requests and new work until active input has drained", async () => {
    const test = await bootFixture();
    expect(test.close().preventDefault).toHaveBeenCalledOnce();
    expect(test.close().preventDefault).toHaveBeenCalledOnce();
    expect(test.stopAndDrain).toHaveBeenCalledOnce();
    await expect(test.invoke(DESKTOP_IPC.startTask)).rejects.toThrow("before closing");
    expect(test.destroy).not.toHaveBeenCalled();
    expect(test.quit).not.toHaveBeenCalled();
    test.drain.finish();
    await vi.waitFor(() => expect(test.quit).toHaveBeenCalledOnce());
    expect(test.destroy).toHaveBeenCalledOnce();
    expect(test.oauth.settleConnection).toHaveBeenCalledOnce();
  });

  it("waits for a late connection before revoking its unsaved grant and quitting", async () => {
    const test = await bootFixture(),
      connection = deferred();
    test.oauth.settleConnection.mockReturnValue(connection.promise);
    test.close();
    test.drain.finish();
    await vi.waitFor(() => expect(test.oauth.settleConnection).toHaveBeenCalledOnce());
    expect(test.quit).not.toHaveBeenCalled();
    test.oauth.requiresRecovery.mockReturnValue(true);
    connection.finish();
    await vi.waitFor(() => expect(test.quit).toHaveBeenCalledOnce());
    expect(test.oauth.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps recovery available if revocation fails, then allows a successful close retry", async () => {
    const test = await bootFixture();
    test.oauth.requiresRecovery.mockReturnValue(true);
    test.oauth.disconnect.mockRejectedValueOnce(new Error("Network unavailable"));
    test.close();
    test.drain.finish();
    await vi.waitFor(() => expect(test.webContents.send).toHaveBeenCalled());
    expect(test.quit).not.toHaveBeenCalled();
    expect(test.destroy).not.toHaveBeenCalled();
    const state = await test.invoke(DESKTOP_IPC.getState);
    expect(state).toMatchObject({
      connectionRecoveryRequired: true,
      error: expect.stringContaining("could not be revoked"),
    });
    test.close();
    await vi.waitFor(() => expect(test.quit).toHaveBeenCalledOnce());
    expect(test.oauth.disconnect).toHaveBeenCalledTimes(2);
  });
});

it("does not boot a workspace or native task for installer lifecycle events", async () => {
  const test = await bootFixture(true);
  expect(test.booted).toBe(false);
  expect(test.stopAndDrain).not.toHaveBeenCalled();
  expect(test.webContents.send).not.toHaveBeenCalled();
  expect(test.oauth.settleConnection).not.toHaveBeenCalled();
});

it.each([
  ["--squirrel-install", "--createShortcut=BotBoundDesktop.exe"],
  ["--squirrel-updated", "--createShortcut=BotBoundDesktop.exe"],
  ["--squirrel-uninstall", "--removeShortcut=BotBoundDesktop.exe"],
  ["--squirrel-obsolete", null],
  ["--squirrel-firstrun", null],
])("handles %s without starting native input", (flag, shortcut) => {
  const desktopRequire = createRequire(resolve("apps/desktop/package.json"));
  const module = { exports: false };
  const quit = vi.fn();
  let close: (() => void) | undefined;
  const spawn = vi.fn((_file: string, _args: string[], _options: unknown) => ({
    on: (event: string, callback: () => void) => {
      expect(event).toBe("close");
      close = callback;
    },
  }));
  runInNewContext(readFileSync(desktopRequire.resolve("electron-squirrel-startup"), "utf8"), {
    module,
    process: {
      platform: "win32",
      execPath: "C:\\BotBound\\app-0.1.0\\BotBoundDesktop.exe",
      argv: ["app", flag],
    },
    require: (name: string) => {
      if (name === "path") return requireBuiltin("node:path").win32;
      if (name === "child_process") return { spawn };
      if (name === "electron") return { app: { quit } };
      if (name === "debug") return () => () => undefined;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  expect(module.exports).toBe(flag !== "--squirrel-firstrun");
  if (shortcut) {
    expect(spawn).toHaveBeenCalledWith("C:\\BotBound\\Update.exe", [shortcut], { detached: true });
    expect(quit).not.toHaveBeenCalled();
    close!();
    expect(quit).toHaveBeenCalledOnce();
  } else {
    expect(spawn).not.toHaveBeenCalled();
    expect(quit).toHaveBeenCalledTimes(flag === "--squirrel-obsolete" ? 1 : 0);
  }
});
