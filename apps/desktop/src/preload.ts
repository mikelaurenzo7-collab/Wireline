import { contextBridge, ipcRenderer } from "electron";
import { DESKTOP_IPC, type DesktopBridge, type DesktopState } from "./contracts";

const bridge: DesktopBridge = {
  getState: () => ipcRenderer.invoke(DESKTOP_IPC.getState),
  connect: () => ipcRenderer.invoke(DESKTOP_IPC.connect),
  disconnect: () => ipcRenderer.invoke(DESKTOP_IPC.disconnect),
  confirmRevocation: (confirmed) => ipcRenderer.invoke(DESKTOP_IPC.confirmRevocation, confirmed),
  refreshWindows: () => ipcRenderer.invoke(DESKTOP_IPC.refreshWindows),
  startTask: (input) => ipcRenderer.invoke(DESKTOP_IPC.startTask, input),
  approve: (id) => ipcRenderer.invoke(DESKTOP_IPC.approve, id),
  stop: () => ipcRenderer.invoke(DESKTOP_IPC.stop),
  reply: (text) => ipcRenderer.invoke(DESKTOP_IPC.reply, text),
  complete: () => ipcRenderer.invoke(DESKTOP_IPC.complete),
  addServer: (input) => ipcRenderer.invoke(DESKTOP_IPC.addServer, input),
  refreshServer: (id) => ipcRenderer.invoke(DESKTOP_IPC.refreshServer, id),
  approveCatalog: (input) => ipcRenderer.invoke(DESKTOP_IPC.approveCatalog, input),
  removeServer: (id) => ipcRenderer.invoke(DESKTOP_IPC.removeServer, id),
  openAccount: () => ipcRenderer.invoke(DESKTOP_IPC.openAccount),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: DesktopState) => callback(state);
    ipcRenderer.on(DESKTOP_IPC.stateChanged, listener);
    return () => {
      ipcRenderer.removeListener(DESKTOP_IPC.stateChanged, listener);
    };
  },
};

contextBridge.exposeInMainWorld("botbound", Object.freeze(bridge));
