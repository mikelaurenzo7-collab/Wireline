import type { ComputerAction, ComputerStepProposal } from "../../../src/lib/computer-protocol";

export type Bot = { id: string; name: string };
export type WindowChoice = { id: string; title: string; appName: string };
export type ToolDescription = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};
export type McpServerView = {
  id: string;
  label: string;
  url: string;
  hasCredential: boolean;
  tools: ToolDescription[];
  catalogDigest: string;
  approvedDigest: string | null;
  selectedTools: string[];
};
export type TaskStatus =
  | "planning"
  | "approval"
  | "executing"
  | "needs_input"
  | "review_result"
  | "completed"
  | "stopped"
  | "unknown"
  | "failed";
export type TaskReceipt = {
  id: string;
  action: ComputerAction;
  summary: string;
  status: "claimed" | "applied" | "rejected" | "unknown";
  result: string;
  createdAt: number;
};
export type TaskView = {
  id: string;
  bot: Bot;
  goal: string;
  window: WindowChoice | null;
  status: TaskStatus;
  step: number;
  expiresAt: number;
  message: string;
  proposal: (ComputerStepProposal & { id: string }) | null;
  receipts: TaskReceipt[];
  /** Owner checked the destination; unknown receipts remain unknown, never successful. */
  unknownOutcomeReviewed?: boolean;
  /** Computed from the live in-process grant, never trusted from saved history. */
  canResume?: boolean;
  /** Only the explicitly selected window. Not retained in the local journal. */
  preview?: string;
};
export type DesktopState = {
  connected: boolean;
  connecting: boolean;
  connectionRecoveryRequired?: boolean;
  connectionManualRecoveryRequired?: boolean;
  bots: Bot[];
  windows: WindowChoice[];
  servers: McpServerView[];
  task: TaskView | null;
  error: string | null;
  platform: string;
};
export type StartTask = {
  botId: string;
  goal: string;
  windowId: string | null;
  serverIds: string[];
  shareConfirmed: boolean;
};
/** Preload exposes named operations, never arbitrary IPC, URLs, code or file paths. */
export interface DesktopBridge {
  getState(): Promise<DesktopState>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  confirmRevocation(confirmed: boolean): Promise<void>;
  refreshWindows(): Promise<void>;
  startTask(input: StartTask): Promise<void>;
  approve(proposalId: string): Promise<void>;
  stop(): Promise<void>;
  reply(text: string): Promise<void>;
  complete(): Promise<void>;
  addServer(input: { label: string; url: string; token: string }): Promise<void>;
  refreshServer(id: string): Promise<void>;
  approveCatalog(input: { id: string; digest: string; names: string[] }): Promise<void>;
  removeServer(id: string): Promise<void>;
  openAccount(): Promise<void>;
  onState(callback: (state: DesktopState) => void): () => void;
}

export const DESKTOP_IPC = {
  getState: "desktop:state",
  connect: "desktop:connect",
  disconnect: "desktop:disconnect",
  confirmRevocation: "desktop:confirm-revocation",
  refreshWindows: "desktop:windows",
  startTask: "desktop:start",
  approve: "desktop:approve",
  stop: "desktop:stop",
  reply: "desktop:reply",
  complete: "desktop:complete",
  addServer: "desktop:server:add",
  refreshServer: "desktop:server:refresh",
  approveCatalog: "desktop:server:approve",
  removeServer: "desktop:server:remove",
  openAccount: "desktop:account",
  stateChanged: "desktop:state-changed",
} as const;
