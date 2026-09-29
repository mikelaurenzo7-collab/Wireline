import squirrelStartup from "electron-squirrel-startup";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  powerMonitor,
  safeStorage,
  shell,
} from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DesktopStore } from "./store";
import { createWorkspaceCommitter } from "./workspace-persistence";
import { DesktopOAuth } from "./oauth";
import { catalogDigest, McpClient } from "./mcp-client";
import { validateEndpoint } from "./transport";
import { createNativeAdapter, nativeCaptureWindowId } from "./native";
import { TaskEngine } from "./task-engine";
import {
  DESKTOP_IPC,
  type Bot,
  type DesktopState,
  type StartTask,
  type WindowChoice,
} from "./contracts";
import { COMPUTER_LIMITS } from "../../../src/lib/computer-protocol";

let window: BrowserWindow | null = null;
let store: DesktopStore;
let oauth: DesktopOAuth;
let engine: TaskEngine;
let bots: Bot[] = [];
let windows: WindowChoice[] = [];
let error: string | null = null;
let connecting = false;
let connectionEpoch = 0;
let connectController: AbortController | null = null;
let closing = false;
const clients = new Map<string, McpClient>();
const renderer = join(__dirname, "renderer", "index.html");
const rendererUrl = pathToFileURL(renderer).href;

function state(): DesktopState {
  const saved = store.read();
  return {
    connected: Boolean(saved.credential),
    connecting,
    connectionRecoveryRequired: oauth?.requiresRecovery() || false,
    connectionManualRecoveryRequired: oauth?.requiresManualRecovery() || false,
    bots: saved.credential ? bots : [],
    windows,
    servers: saved.credential
      ? saved.servers.map(({ token, ...server }) => ({ ...server, hasCredential: Boolean(token) }))
      : [],
    task: saved.credential ? engine?.view() || null : null,
    error,
    platform: process.platform,
  };
}
function notify(): void {
  if (window && !window.isDestroyed()) window.webContents.send(DESKTOP_IPC.stateChanged, state());
}
function ensureIdle(): void {
  if (engine?.active()) throw new Error("Stop the current task before changing connections.");
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max) throw new Error("Invalid input.");
  return value.trim();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid input.");
  return value as Record<string, unknown>;
}
function serverClient(id: string): McpClient {
  const server = store.read().servers.find((item) => item.id === id);
  if (!server) throw new Error("Tool connection not found.");
  let client = clients.get(id);
  if (!client) {
    client = new McpClient(server.url, async () => {
      const current = store.read().servers.find((item) => item.id === id);
      if (!current || current.url !== server.url)
        throw new Error("The tool connection was removed.");
      return current.token;
    });
    clients.set(id, client);
  }
  return client;
}

async function boot(): Promise<void> {
  if (!["win32", "darwin"].includes(process.platform))
    throw new Error("BotBound Desktop currently supports Windows and macOS.");
  if (!safeStorage.isEncryptionAvailable())
    throw new Error("Your operating system's secure credential storage is unavailable.");
  const helperPath = join(
    app.isPackaged ? process.resourcesPath : __dirname,
    "native",
    process.platform,
    process.platform === "win32" ? "BotBound.Native.exe" : "BotBound.Native",
  );
  store = new DesktopStore(
    app.getPath("userData"),
    {
      encrypt: (value) => safeStorage.encryptString(value),
      decrypt: (value) => safeStorage.decryptString(value),
    },
    createWorkspaceCommitter(helperPath),
  );
  await store.load();
  oauth = new DesktopOAuth(store, async (url) => {
    const parsed = new URL(url);
    if (parsed.origin !== "https://botbound.app" || parsed.pathname !== "/mcp/oauth/authorize")
      throw new Error("Unexpected sign-in destination.");
    await shell.openExternal(url);
  });
  const planner = new McpClient("https://botbound.app/mcp", () => oauth.token());
  const native = createNativeAdapter({
    helperPath,
    captureWindow: async (target, signal) => {
      signal?.throwIfAborted();
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: {
          width: COMPUTER_LIMITS.imageDimension,
          height: COMPUTER_LIMITS.imageDimension,
        },
        fetchWindowIcons: false,
      });
      signal?.throwIfAborted();
      const source = sources.find(
        (item) => item.id.split(":")[1] === nativeCaptureWindowId(target.id),
      );
      if (!source || source.thumbnail.isEmpty())
        throw new Error(
          "The shared window could not be captured. Check screen-recording permission and keep it visible.",
        );
      const dimensions = source.thumbnail.getSize();
      const bytes = source.thumbnail.toPNG();
      if (bytes.byteLength > COMPUTER_LIMITS.imageBytes)
        throw new Error("This window capture is too large. Use a smaller window.");
      return {
        mimeType: "image/png" as const,
        data: bytes.toString("base64"),
        width: dimensions.width,
        height: dimensions.height,
      };
    },
  });
  engine = new TaskEngine({
    store,
    native,
    planner,
    server: serverClient,
    notify,
    platform: process.platform === "darwin" ? "macos" : "windows",
  });
  const loadBots = async () => {
    const epoch = connectionEpoch,
      accountId = store.read().credential?.accountId;
    if (!accountId) return;
    const response = await planner.call("list_wireline_agents", {}).catch((failure: unknown) => {
      if (epoch !== connectionEpoch || store.read().credential?.accountId !== accountId)
        return null;
      throw failure;
    });
    if (!response || epoch !== connectionEpoch || store.read().credential?.accountId !== accountId)
      return;
    if (response.isError) throw new Error(response.text || "Could not load your Bots.");
    const data = object(response.structuredContent);
    if (!Array.isArray(data.agents)) throw new Error("BotBound returned an invalid Bot list.");
    bots = data.agents.map((value) => {
      const item = object(value);
      return { id: text(item.id, 160), name: text(item.name, 200) };
    });
  };
  const handle = (channel: string, operation: (input: unknown) => Promise<unknown> | unknown) =>
    ipcMain.handle(channel, async (event, input: unknown) => {
      if (
        !window ||
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== rendererUrl
      )
        throw new Error("This action is available only in BotBound Desktop.");
      try {
        if (closing && channel !== DESKTOP_IPC.getState && channel !== DESKTOP_IPC.stop)
          throw new Error(
            "BotBound Desktop is waiting for active operations to stop before closing.",
          );
        if (channel !== DESKTOP_IPC.getState) error = null;
        const result = await operation(input);
        notify();
        return result;
      } catch (failure) {
        error = failure instanceof Error ? failure.message : "This action could not finish.";
        notify();
        throw new Error(error);
      }
    });
  handle(DESKTOP_IPC.getState, () => state());
  handle(DESKTOP_IPC.connect, async () => {
    ensureIdle();
    if (connecting) throw new Error("A connection is already in progress.");
    if (store.read().credential)
      throw new Error("Disconnect before connecting a different account.");
    connectionEpoch++;
    connecting = true;
    connectController = new AbortController();
    notify();
    try {
      await oauth.connect(connectController.signal);
      clients.clear();
      engine.resetAccount();
      await loadBots();
    } finally {
      connecting = false;
      connectController = null;
    }
  });
  handle(DESKTOP_IPC.disconnect, async () => {
    connectionEpoch++;
    connectController?.abort();
    await engine.stop();
    await oauth.disconnect();
    bots = [];
    clients.clear();
  });
  handle(DESKTOP_IPC.refreshWindows, async () => {
    windows = (await native.listWindows())
      .filter((item) => item.processId !== process.pid)
      .map(({ id, title, appName }) => ({ id, title, appName }));
  });
  handle(DESKTOP_IPC.confirmRevocation, async (confirmed) => {
    ensureIdle();
    await oauth.confirmRevocation(confirmed === true);
    bots = [];
    clients.clear();
  });
  handle(DESKTOP_IPC.startTask, async (value) => {
    const input = object(value);
    if (typeof input.shareConfirmed !== "boolean" || !Array.isArray(input.serverIds))
      throw new Error("Invalid task sharing.");
    const start: StartTask = {
      botId: text(input.botId, 160),
      goal: text(input.goal, 4000),
      windowId: input.windowId === null ? null : text(input.windowId, 300),
      serverIds: input.serverIds.map((id) => text(id, 160)),
      shareConfirmed: input.shareConfirmed,
    };
    await engine.start(start, bots);
  });
  handle(DESKTOP_IPC.approve, (id) => engine.approve(text(id, 160)));
  handle(DESKTOP_IPC.stop, () => {
    connectController?.abort();
    return engine.stop();
  });
  handle(DESKTOP_IPC.reply, (reply) => engine.reply(text(reply, 1000)));
  handle(DESKTOP_IPC.complete, () => {
    if (connecting) throw new Error("Wait for the account connection before reviewing a task.");
    return engine.complete();
  });
  handle(DESKTOP_IPC.addServer, async (value) => {
    ensureIdle();
    if (!store.read().credential)
      throw new Error("Connect your BotBound account before adding tools.");
    const input = object(value);
    const label = text(input.label, 100),
      url = validateEndpoint(text(input.url, 2048)),
      token = text(input.token, 8192);
    if (!label || /[\r\n]/.test(token))
      throw new Error("Enter a connection name and valid credential.");
    const saved = store.read();
    const accountId = saved.credential!.accountId,
      epoch = connectionEpoch;
    if (saved.servers.length >= 12 || saved.servers.some((item) => item.url === url))
      throw new Error("This connection already exists, or the connection limit was reached.");
    const id = randomUUID();
    const tools = await new McpClient(url, async () => token).tools();
    await store.update((current) => {
      ensureIdle();
      if (epoch !== connectionEpoch || current.credential?.accountId !== accountId)
        throw new Error(
          "The account changed while connecting these tools. Add them again in the intended account.",
        );
      if (current.servers.length >= 12 || current.servers.some((item) => item.url === url))
        throw new Error("This connection already exists, or the connection limit was reached.");
      return {
        ...current,
        servers: [
          ...current.servers,
          {
            id,
            label,
            url,
            token,
            tools,
            catalogDigest: catalogDigest(tools),
            approvedDigest: null,
            selectedTools: [],
          },
        ],
      };
    });
  });
  handle(DESKTOP_IPC.refreshServer, async (value) => {
    ensureIdle();
    const id = text(value, 160);
    const accountId = store.read().credential?.accountId,
      epoch = connectionEpoch;
    if (!accountId) throw new Error("Connect your BotBound account first.");
    const tools = await serverClient(id).tools(),
      digest = catalogDigest(tools);
    await store.update((current) => {
      ensureIdle();
      if (epoch !== connectionEpoch || current.credential?.accountId !== accountId)
        throw new Error("The account changed while reading these tools.");
      return {
        ...current,
        servers: current.servers.map((server) =>
          server.id !== id
            ? server
            : {
                ...server,
                tools,
                catalogDigest: digest,
                approvedDigest: server.approvedDigest === digest ? digest : null,
                selectedTools: server.approvedDigest === digest ? server.selectedTools : [],
              },
        ),
      };
    });
  });
  handle(DESKTOP_IPC.approveCatalog, async (value) => {
    ensureIdle();
    const input = object(value),
      id = text(input.id, 160),
      digest = text(input.digest, 64);
    if (!Array.isArray(input.names) || input.names.length > COMPUTER_LIMITS.tools)
      throw new Error("Select at most 32 tools.");
    const names = [...new Set(input.names.map((name) => text(name, 128)))];
    const epoch = connectionEpoch,
      accountId = store.read().credential?.accountId;
    if (!accountId) throw new Error("Connect your BotBound account first.");
    await store.update((current) => {
      ensureIdle();
      if (epoch !== connectionEpoch || current.credential?.accountId !== accountId)
        throw new Error("The account changed while approving these tools.");
      const server = current.servers.find((item) => item.id === id);
      if (
        !server ||
        server.catalogDigest !== digest ||
        names.some((name) => !server.tools.some((tool) => tool.name === name))
      )
        throw new Error("The tool catalog changed. Refresh it before approving.");
      return {
        ...current,
        servers: current.servers.map((item) =>
          item.id === id ? { ...item, approvedDigest: digest, selectedTools: names } : item,
        ),
      };
    });
  });
  handle(DESKTOP_IPC.removeServer, async (value) => {
    ensureIdle();
    const id = text(value, 160);
    const epoch = connectionEpoch,
      accountId = store.read().credential?.accountId;
    if (!accountId) throw new Error("Connect your BotBound account first.");
    await store.update((current) => {
      ensureIdle();
      if (epoch !== connectionEpoch || current.credential?.accountId !== accountId)
        throw new Error("The account changed while removing these tools.");
      return { ...current, servers: current.servers.filter((item) => item.id !== id) };
    });
    clients.delete(id);
  });
  handle(DESKTOP_IPC.openAccount, () => shell.openExternal("https://botbound.app/settings/apps"));

  window = new BrowserWindow({
    width: 1020,
    height: 780,
    minWidth: 420,
    minHeight: 580,
    title: "BotBound Desktop",
    backgroundColor: "#09090b",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.on("close", (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    connectController?.abort();
    void engine
      .stopAndDrain("Closing. Waiting for active operations to stop safely.")
      .catch(() => undefined)
      .then(async () => {
        await oauth.settleConnection();
        if (oauth.requiresRecovery()) await oauth.disconnect();
        window?.destroy();
        app.quit();
      })
      .catch(() => {
        closing = false;
        error =
          "The pending connection could not be revoked. Use Disconnect or your account's Apps settings before closing.";
        notify();
      });
  });
  await window.loadFile(renderer);
  const stopSharing = (message: string) => {
    connectController?.abort();
    void engine.stop(message).catch(() => {
      error =
        "Access is stopped, but its final receipt could not be saved. Review the target before starting again.";
      notify();
    });
  };
  if (
    !globalShortcut.register("CommandOrControl+Shift+.", () =>
      stopSharing("Stopped with the keyboard shortcut."),
    )
  )
    error = "The global Stop shortcut is unavailable. Use the visible Stop button.";
  powerMonitor.on("lock-screen", () =>
    stopSharing("The computer locked. Start a new task after unlocking."),
  );
  powerMonitor.on("suspend", () =>
    stopSharing("The computer slept. Start a new task to continue."),
  );
  if (store.read().credential) {
    try {
      await loadBots();
    } catch {
      error = "Reconnect your BotBound account to load your Bots.";
    }
    notify();
  }
}

// Squirrel handles install/update/uninstall before any workspace or native boot.
if (!squirrelStartup) {
  if (!app.requestSingleInstanceLock()) app.quit();
  else {
    app.on("second-instance", () => {
      window?.show();
      window?.focus();
    });
    app
      .whenReady()
      .then(boot)
      .catch(async () => {
        const { dialog } = await import("electron");
        dialog.showErrorBox(
          "BotBound Desktop",
          "Could not open the secure workspace. Check your OS permissions and installation; your saved data has not been reset.",
        );
        app.quit();
      });
    app.on("will-quit", () => globalShortcut.unregisterAll());
  }
}
