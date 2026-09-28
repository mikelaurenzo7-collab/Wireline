import { mkdtemp, open, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopStore, type SavedState } from "../apps/desktop/src/store";
import { TaskEngine } from "../apps/desktop/src/task-engine";
import type { McpClient } from "../apps/desktop/src/mcp-client";
import type { NativeAdapter, NativeObservation } from "../apps/desktop/src/native";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const encryption = {
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (bytes: Buffer) => bytes.toString(),
};
const state = (accountId: string): SavedState => ({
  version: 1,
  credential: null,
  servers: [],
  task: null,
  accountId,
});
const directories: string[] = [];
async function directory() {
  const result = await mkdtemp(join(tmpdir(), "botbound-durability-test-"));
  directories.push(result);
  return result;
}
// This explicit fixture simulates only a successful OS acknowledgment. Actual
// durability comes from each platform helper, not Node rename in these tests.
const acknowledge = (path: string, temporary: string) =>
  rename(join(path, temporary), join(path, "workspace.enc"));

afterEach(async () => {
  vi.clearAllMocks();
  for (const path of directories.splice(0)) {
    const target = resolve(path);
    if (
      dirname(target) !== resolve(tmpdir()) ||
      !basename(target).startsWith("botbound-durability-test-")
    )
      throw new Error("Refusing cleanup outside the durability test directory.");
    await rm(target, { recursive: true, force: true });
  }
});

describe("desktop durable replacement boundary", () => {
  it("does not publish or resolve a new state before native commit acknowledgment", async () => {
    const path = await directory();
    let finish!: () => void;
    const committed = new Promise<void>((done) => {
      finish = done;
    });
    const commit = vi.fn(async (root: string, temporary: string) => {
      const bytes = await readFile(join(root, temporary), "utf8");
      expect(JSON.parse(bytes).accountId).toBe("new");
      await committed;
      await acknowledge(root, temporary);
    });
    const store = new DesktopStore(path, encryption, commit);
    let resolved = false;
    const save = store.save(state("new")).then(() => {
      resolved = true;
    });
    await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    expect(resolved).toBe(false);
    expect(store.read().accountId).toBeUndefined();
    finish();
    await save;
    expect(store.read().accountId).toBe("new");
  });

  it("keeps a failed temporary flush retryable and never begins replacement", async () => {
    const path = await directory();
    const commit = vi.fn(acknowledge);
    const store = new DesktopStore(path, encryption, commit);
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      const handle = await actual.open(...args);
      handle.sync = vi.fn(async () => {
        throw new Error("Disk flush failed");
      });
      return handle;
    });
    await expect(store.save(state("first"))).rejects.toThrow("Disk flush failed");
    expect(commit).not.toHaveBeenCalled();
    expect(store.read().accountId).toBeUndefined();
    await store.save(state("retry"));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(store.read().accountId).toBe("retry");
  });

  it("latches an uncertain replacement and keeps the last confirmed memory state", async () => {
    const path = await directory();
    const commit = vi.fn(acknowledge);
    const store = new DesktopStore(path, encryption, commit);
    await store.save(state("confirmed"));
    // Simulate the hard case: rename happened but its directory/drive flush or
    // helper acknowledgment failed. The process must not infer which survived.
    commit.mockImplementationOnce(async (...args) => {
      await acknowledge(...args);
      throw new Error("Restart BotBound Desktop before continuing.");
    });
    await expect(store.save(state("uncertain"))).rejects.toThrow("Restart");
    expect(store.read().accountId).toBe("confirmed");
    await expect(store.save(state("must-not-overwrite"))).rejects.toThrow(
      "Restart BotBound Desktop",
    );
    expect(commit).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(join(path, "workspace.enc"), "utf8")).accountId).toBe(
      "uncertain",
    );
  });

  it("blocks native dispatch when the execution claim replacement is unconfirmed", async () => {
    const path = await directory();
    const commit = vi.fn(acknowledge);
    const store = new DesktopStore(path, encryption, commit);
    const observed: NativeObservation = {
      window: {
        id: "w1",
        title: "Document",
        appName: "Editor",
        processId: 10,
        bounds: { x: 0, y: 0, width: 200, height: 100 },
        scaleFactor: 1,
      },
      screenshot: { mimeType: "image/png", data: "aGVsbG8=", width: 200, height: 100 },
      fingerprint: "frame1",
    };
    const native = {
      listWindows: vi.fn(async () => [observed.window]),
      observe: vi.fn(async () => observed),
      execute: vi.fn(async () => ({ status: "applied" as const, message: "Input accepted." })),
    };
    const engine = new TaskEngine({
      store,
      native: native as NativeAdapter,
      planner: {
        call: vi.fn(async () => ({
          structuredContent: {
            decision: "action",
            summary: "Enter a title.",
            action: { type: "type_text", text: "Title" },
          },
          text: "",
          isError: false,
        })),
      } as unknown as McpClient,
      server: () => {
        throw new Error("No remote tools configured");
      },
      notify: vi.fn(),
      platform: "windows",
    });
    try {
      await engine.start(
        {
          botId: "bot1",
          goal: "Prepare a document",
          windowId: "w1",
          serverIds: [],
          shareConfirmed: true,
        },
        [{ id: "bot1", name: "Bot" }],
      );
      expect(engine.view()?.status).toBe("approval");
      commit.mockImplementationOnce(async (...args) => {
        await acknowledge(...args);
        throw new Error("The local save could not be confirmed. Restart BotBound Desktop.");
      });
      await expect(engine.approve(engine.view()!.proposal!.id)).rejects.toThrow(
        "Restart BotBound Desktop",
      );
      expect(native.execute).not.toHaveBeenCalled();
      expect(store.read().task?.receipts).toHaveLength(0);
      const durable = JSON.parse(await readFile(join(path, "workspace.enc"), "utf8")) as SavedState;
      expect(durable.task?.receipts[0].status).toBe("claimed");
      const restored = await new DesktopStore(path, encryption, acknowledge).load();
      expect(restored.task?.status).toBe("unknown");
      expect(restored.task?.receipts[0].status).toBe("unknown");
    } finally {
      await engine.stop().catch(() => undefined);
    }
  });
});
