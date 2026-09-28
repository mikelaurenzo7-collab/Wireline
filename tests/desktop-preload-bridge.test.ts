import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
const compiled = buildSync({
  entryPoints: [resolve("apps/desktop/src/preload.ts")],
  platform: "node",
  format: "cjs",
  bundle: true,
  write: false,
  external: ["electron"],
}).outputFiles[0].text;

beforeEach(() => {
  vi.clearAllMocks();
  runInNewContext(compiled, {
    require: (name: string) => {
      if (name !== "electron") throw new Error(`Unexpected preload dependency: ${name}`);
      return { contextBridge: electron, ipcRenderer: electron };
    },
  });
});

describe("desktop preload boundary", () => {
  it("exposes only named operations and cannot invoke an arbitrary IPC channel", () => {
    const [name, bridge] = electron.exposeInMainWorld.mock.calls[0];
    expect(name).toBe("botbound");
    expect(Object.isFrozen(bridge)).toBe(true);
    expect(Object.keys(bridge).sort()).toEqual(
      [
        "addServer",
        "approve",
        "approveCatalog",
        "complete",
        "connect",
        "confirmRevocation",
        "disconnect",
        "getState",
        "onState",
        "openAccount",
        "refreshServer",
        "refreshWindows",
        "removeServer",
        "reply",
        "startTask",
        "stop",
      ].sort(),
    );
    expect(bridge).not.toHaveProperty("invoke");
    expect(bridge).not.toHaveProperty("send");
  });

  it("passes only the proposal identifier for owner approval and has a separate stop operation", async () => {
    const bridge = electron.exposeInMainWorld.mock.calls[0][1];
    await bridge.approve("proposal-1");
    await bridge.stop();
    expect(electron.invoke.mock.calls).toEqual([
      ["desktop:approve", "proposal-1"],
      ["desktop:stop"],
    ]);
  });

  it("strips the privileged IPC event and removes only its own subscription", () => {
    const bridge = electron.exposeInMainWorld.mock.calls[0][1];
    const callback = vi.fn();
    const unsubscribe = bridge.onState(callback);
    const [channel, listener] = electron.on.mock.calls[0];
    const state = { connected: false };
    listener({ sender: "privileged" }, state);
    expect(callback).toHaveBeenCalledWith(state);
    expect(callback.mock.calls[0]).toHaveLength(1);
    unsubscribe();
    expect(electron.removeListener).toHaveBeenCalledWith(channel, listener);
  });
});
