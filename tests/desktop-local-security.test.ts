import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DesktopStore, type SavedState } from "../apps/desktop/src/store";
import { matchingState } from "../apps/desktop/src/oauth";
import { hasCompleteRpcEvent, validateEndpoint } from "../apps/desktop/src/transport";
import { McpClient, validateToolArguments } from "../apps/desktop/src/mcp-client";

// These tests prove encryption/recovery semantics, not native disk durability.
const commitFixture = (directory: string, temporary: string) =>
  rename(join(directory, temporary), join(directory, "workspace.enc"));

async function removeTestDirectory(directory: string): Promise<void> {
  const target = resolve(directory);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("botbound-desktop-test-")
  )
    throw new Error("Refusing to remove a directory outside this test's temporary scope.");
  await rm(target, { recursive: true, force: true });
}

describe("desktop storage and token safety", () => {
  it("fails closed on a claimed action after restart and does not retain screenshots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botbound-desktop-test-"));
    const encryption = {
      encrypt: (value: string) => Buffer.from(value).reverse(),
      decrypt: (value: Buffer) => Buffer.from(value).reverse().toString(),
    };
    try {
      const store = new DesktopStore(directory, encryption, commitFixture);
      await store.load();
      const state: SavedState = {
        version: 1,
        credential: null,
        servers: [],
        task: {
          id: "task1",
          bot: { id: "bot1", name: "Bot" },
          goal: "Prepare a document",
          window: null,
          status: "executing",
          step: 1,
          expiresAt: Date.now() + 1000,
          message: "Pending",
          proposal: null,
          preview: "private screenshot",
          receipts: [
            {
              id: "one",
              summary: "Enter text",
              action: { type: "type_text", text: "draft" },
              status: "claimed",
              result: "pending",
              createdAt: Date.now(),
            },
          ],
        },
      };
      await store.save(state);
      const reloaded = await new DesktopStore(directory, encryption, commitFixture).load();
      expect(reloaded.task?.status).toBe("unknown");
      expect(reloaded.task?.receipts[0].status).toBe("unknown");
      expect(reloaded.task?.preview).toBeUndefined();
      expect((await readFile(join(directory, "workspace.enc"))).toString()).not.toContain(
        "Prepare a document",
      );
    } finally {
      await removeTestDirectory(directory);
    }
  });
  it("serializes independent token and task updates without losing either", async () => {
    const directory = await mkdtemp(join(tmpdir(), "botbound-desktop-test-"));
    const store = new DesktopStore(
      directory,
      {
        encrypt: (text) => Buffer.from(text),
        decrypt: (bytes) => bytes.toString(),
      },
      commitFixture,
    );
    try {
      await Promise.all([
        store.update((value) => ({
          ...value,
          credential: { accountId: "owner1", accessToken: "a", refreshToken: "r", expiresAt: 123 },
        })),
        store.update((value) => ({
          ...value,
          servers: [
            {
              id: "s",
              label: "Tools",
              url: "https://example.com/mcp",
              token: "",
              tools: [],
              catalogDigest: "d",
              approvedDigest: null,
              selectedTools: [],
            },
          ],
        })),
      ]);
      expect(store.read().credential?.accessToken).toBe("a");
      expect(store.read().servers).toHaveLength(1);
    } finally {
      await removeTestDirectory(directory);
    }
  });
  it("checks PKCE callback state without accepting unicode or mismatched byte lengths", () => {
    expect(matchingState("a", "a")).toBe(true);
    expect(matchingState("é", "a")).toBe(false);
    expect(matchingState(null, "a")).toBe(false);
  });
  it("refuses credentials, non-HTTPS, query tokens, nonstandard ports, and fragments in endpoints", () => {
    for (const url of [
      "http://example.com",
      "https://user:pass@example.com",
      "https://example.com:8443/mcp",
      "https://example.com?token=x",
      "https://example.com/#secret",
    ])
      expect(() => validateEndpoint(url)).toThrow();
  });
  it("recognizes a complete matching SSE result without waiting for the stream to close", () => {
    const message = 'data: {"jsonrpc":"2.0","id":"one","result":{}}';
    expect(hasCompleteRpcEvent(message, "one")).toBe(false);
    expect(hasCompleteRpcEvent(`${message}\n\n`, "one")).toBe(true);
    expect(hasCompleteRpcEvent(`${message}\n\n`, "other")).toBe(false);
  });
  it("validates schema arguments without coercion, remote refs, or dangerous regex", () => {
    const tool = {
      name: "research",
      description: "",
      inputSchema: {
        type: "object",
        properties: { count: { type: "integer" } },
        required: ["count"],
        additionalProperties: false,
      },
    };
    expect(() => validateToolArguments(tool, { count: "10" })).toThrow();
    expect(() => validateToolArguments(tool, { count: 10 })).not.toThrow();
    expect(() =>
      validateToolArguments({ ...tool, inputSchema: { $ref: "https://example.com/schema" } }, {}),
    ).toThrow("remote");
    expect(() =>
      validateToolArguments({ ...tool, inputSchema: { type: "string", pattern: "(a+)+$" } }, {}),
    ).toThrow("regular-expression");
  });
  it("does not retry a refused/uncertain tool call", async () => {
    let requests = 0;
    const client = new McpClient(
      "https://example.com/mcp",
      async () => "token",
      async (_url, body) => {
        requests++;
        const request = JSON.parse(body);
        if (request.method === "initialize")
          return {
            status: 200,
            headers: {},
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: { protocolVersion: "2025-06-18" },
            }),
          };
        if (request.method === "notifications/initialized")
          return { status: 202, headers: {}, body: "" };
        throw new Error("Response lost after tool dispatch");
      },
    );
    await expect(client.call("write", {})).rejects.toThrow("lost");
    expect(requests).toBe(3);
  });
});
