import { mkdir, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { TaskView, ToolDescription } from "./contracts";
import type { WorkspaceCommitter } from "./workspace-persistence";

export type OAuthCredential = {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export type StoredServer = {
  id: string;
  label: string;
  url: string;
  token: string;
  tools: ToolDescription[];
  catalogDigest: string;
  approvedDigest: string | null;
  selectedTools: string[];
};
export type SavedState = {
  version: 1;
  accountId?: string;
  otherAccounts?: Record<string, { servers: StoredServer[]; task: TaskView | null }>;
  credential: OAuthCredential | null;
  /** Written before exchange; a crash/lost response requires owner revocation review. */
  connectionUncertain?: boolean;
  servers: StoredServer[];
  task: TaskView | null;
};
export type Encryption = { encrypt(text: string): Buffer; decrypt(bytes: Buffer): string };
const emptyState = (): SavedState => ({ version: 1, credential: null, servers: [], task: null });

/** All credentials, task text and receipts are encrypted with the OS-backed store. */
export class DesktopStore {
  private value: SavedState = emptyState();
  private queue: Promise<void> = Promise.resolve();
  private persistenceUncertain = false;
  constructor(
    private readonly directory: string,
    private readonly encryption: Encryption,
    private readonly commit: WorkspaceCommitter,
  ) {}

  async load(): Promise<SavedState> {
    try {
      const bytes = await readFile(join(this.directory, "workspace.enc"));
      if (bytes.byteLength > 32 * 1024 * 1024) throw new Error("Local workspace is too large.");
      const data = JSON.parse(this.encryption.decrypt(bytes)) as SavedState;
      if (data.version !== 1 || !Array.isArray(data.servers) || data.servers.length > 12)
        throw new Error("Unrecognized local workspace.");
      this.value = data;
      if (data.task) {
        delete data.task.preview;
        data.task.proposal = null;
        const unresolved = data.task.receipts.some((receipt) => receipt.status === "claimed");
        if (unresolved) {
          data.task.receipts = data.task.receipts.map((receipt) =>
            receipt.status === "claimed"
              ? {
                  ...receipt,
                  status: "unknown",
                  result:
                    "The app closed before recording the result. Check the target before doing this again.",
                }
              : receipt,
          );
          data.task.status = "unknown";
          data.task.message = "The last action has an unknown result. It will not be retried.";
        } else if (!["completed", "stopped", "failed", "unknown"].includes(data.task.status)) {
          data.task.status = "stopped";
          data.task.message = "The app restarted. Start a new task to share access again.";
        }
        await this.save(data);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return structuredClone(this.value);
  }

  read(): SavedState {
    return structuredClone(this.value);
  }

  save(next: SavedState): Promise<void> {
    return this.update(() => next);
  }

  /** Serialize read-modify-write as well as disk I/O; token refresh cannot erase a receipt. */
  update(change: (current: SavedState) => SavedState): Promise<void> {
    const operation = this.queue.then(async () => {
      if (this.persistenceUncertain)
        throw new Error(
          "Local storage requires recovery. Restart BotBound Desktop before continuing.",
        );
      const snapshot = structuredClone(change(structuredClone(this.value)));
      if (snapshot.task) delete snapshot.task.preview;
      // The application-data parent must already exist. The native commit flushes
      // this final directory and its parent; it cannot certify an arbitrary new path tree.
      await mkdir(this.directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") throw error;
      });
      const temporaryBasename = `workspace-${randomUUID()}.tmp`;
      const temporary = join(this.directory, temporaryBasename);
      const encrypted = this.encryption.encrypt(JSON.stringify(snapshot));
      if (encrypted.byteLength > 32 * 1024 * 1024)
        throw new Error("The encrypted workspace has reached its storage limit.");
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(encrypted);
          await file.sync();
        } finally {
          await file.close();
        }
        // File sync alone does not make its replacement directory entry durable.
        // Windows uses write-through MoveFileEx; macOS syncs directories and the drive.
        try {
          await this.commit(this.directory, temporaryBasename);
        } catch (error) {
          // Only the native replacement can leave the prior/new durable state
          // uncertain. A failed temporary write/flush is safe to retry.
          this.persistenceUncertain = true;
          throw error;
        }
      } finally {
        await rm(temporary, { force: true }).catch(() => undefined);
      }
      this.value = snapshot;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
