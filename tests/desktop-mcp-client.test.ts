import { describe, expect, it, vi } from "vitest";
import { McpClient, parseToolResult, validateToolArguments } from "../apps/desktop/src/mcp-client";
import type { PostRequest } from "../apps/desktop/src/transport";
const tool = (inputSchema: Record<string, unknown>) => ({
  name: "update",
  description: "Update selected record",
  inputSchema,
});

describe("desktop MCP schema and result boundary", () => {
  it.each([undefined, "http://json-schema.org/draft-07/schema#"])(
    "accepts schema-keyword argument names and literal annotation data in %s",
    ($schema) => {
      const value = {
        pattern: "query",
        patternProperties: "value",
        $ref: "literal",
        format: "regex",
      };
      const schema = tool({
        ...($schema ? { $schema } : {}),
        type: "object",
        properties: Object.fromEntries(Object.keys(value).map((key) => [key, { type: "string" }])),
        required: Object.keys(value),
        additionalProperties: false,
        default: value,
        examples: [value],
        const: value,
      });
      expect(() => validateToolArguments(schema, value)).not.toThrow();
      expect(() => validateToolArguments(schema, { ...value, pattern: 1 })).toThrow(/do not match/);
    },
  );
  it.each([
    { properties: { query: { pattern: "(a+)+$" } } },
    { $defs: { pattern: { patternProperties: { "(a+)+$": {} } } } },
    { allOf: [{ properties: { query: { format: "regex" } } }] },
    { properties: { values: { type: "array", items: { pattern: "(a+)+$" } } } },
    { default: { pattern: "(a+)+$" }, properties: { query: { $ref: "#/default" } } },
    { default: { $ref: "https://remote.test/schema" }, $ref: "#/default" },
    {
      properties: {
        query: {
          $id: "https://tools.test/query",
          default: { pattern: "(a+)+$" },
          $ref: "#/default",
        },
      },
    },
  ])("still rejects executable regex/remote refs in nested or referenced schemas %j", (schema) => {
    expect(() => validateToolArguments(tool({ type: "object", ...schema }), {})).toThrow(
      /regular-expression|remote references/,
    );
  });
  it("supports keyword-named local definitions and validates their actual schema", () => {
    const schema = tool({
      type: "object",
      $defs: { pattern: { type: "string" } },
      properties: { pattern: { $ref: "#/$defs/pattern" } },
    });
    expect(() => validateToolArguments(schema, { pattern: "literal" })).not.toThrow();
    expect(() => validateToolArguments(schema, { pattern: 1 })).toThrow(/do not match/);
  });
  it("parses mixed-case SSE media types through initialization and a single tool call", async () => {
    const methods: string[] = [];
    const post: PostRequest = vi.fn(async (_url, body) => {
      const rpc = JSON.parse(body);
      methods.push(rpc.method);
      const result =
        rpc.method === "initialize"
          ? { protocolVersion: "2025-06-18" }
          : { content: [{ type: "text", text: "Résultat ✅" }] };
      return {
        status: 200,
        headers: { "content-type": "Text/Event-Stream; charset=utf-8" },
        body: `: keepalive\r\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result })}\r\n\r\n`,
      };
    });
    const client = new McpClient("https://tools.example.test/mcp", async () => "credential", post);
    await expect(client.call("update", {})).resolves.toEqual({
      text: "Résultat ✅",
      isError: false,
    });
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  });
  it("fails an expired-session call without replay and reinitializes only on explicit refresh", async () => {
    const requests: Array<{ method: string; session?: string }> = [];
    let initializations = 0;
    const post: PostRequest = vi.fn(async (_url, body, headers) => {
      const rpc = JSON.parse(body);
      requests.push({ method: rpc.method, session: headers["Mcp-Session-Id"] });
      if (rpc.method === "tools/call") return { status: 404, headers: {}, body: "expired" };
      if (rpc.method === "initialize") initializations++;
      return {
        status: 200,
        headers: {
          "content-type": "application/json",
          ...(rpc.method === "initialize"
            ? { "mcp-session-id": `session-${initializations}` }
            : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result: rpc.method === "initialize" ? { protocolVersion: "2025-06-18" } : { tools: [] },
        }),
      };
    });
    const client = new McpClient("https://tools.example.test/mcp", async () => "credential", post);
    await expect(client.call("update", {})).rejects.toThrow(/HTTP 404.*not retried/);
    expect(requests.map((request) => request.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/call",
    ]);
    await expect(client.tools()).resolves.toEqual([]);
    expect(requests.filter((request) => request.method === "tools/call")).toHaveLength(1);
    expect(requests.filter((request) => request.method === "initialize")).toEqual([
      { method: "initialize", session: undefined },
      { method: "initialize", session: undefined },
    ]);
    expect(requests.at(-1)).toEqual({ method: "tools/list", session: "session-2" });
  });
  it("enforces default2020-12 unevaluated properties instead of silently ignoring them", () => {
    const schema = tool({
      type: "object",
      allOf: [{ properties: { name: { type: "string" } } }],
      unevaluatedProperties: false,
    });
    expect(() => validateToolArguments(schema, { name: "Known" })).not.toThrow();
    expect(() => validateToolArguments(schema, { name: "Known", hiddenWrite: true })).toThrow(
      /do not match/,
    );
  });
  it("supports explicitly declared draft07 and rejects unrecognized dialects", () => {
    const schema = tool({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { tuple: { type: "array", items: [{ type: "string" }], additionalItems: false } },
    });
    expect(() => validateToolArguments(schema, { tuple: ["first"] })).not.toThrow();
    expect(() => validateToolArguments(schema, { tuple: ["first", "extra"] })).toThrow(
      /do not match/,
    );
    expect(() =>
      validateToolArguments(
        tool({ ...schema.inputSchema, $schema: "https://json-schema.org/draft-07/schema" }),
        { tuple: ["first"] },
      ),
    ).not.toThrow();
    expect(() =>
      validateToolArguments(tool({ type: "object", $schema: "https://evil.test/schema" }), {}),
    ).toThrow(/unsupported/);
  });
  it("keeps regex, external refs, oversized arguments and prototype data blocked", () => {
    expect(() =>
      validateToolArguments(
        tool({ type: "object", properties: { value: { type: "string", pattern: "(a+)+$" } } }),
        {},
      ),
    ).toThrow(/regular-expression/);
    expect(() =>
      validateToolArguments(tool({ type: "object", $ref: "https://evil.test/schema" }), {}),
    ).toThrow(/remote references/);
    expect(() =>
      validateToolArguments(tool({ type: "object" }), { value: "a".repeat(24_001) }),
    ).toThrow(/too large/);
    expect(() =>
      validateToolArguments(
        tool({ type: "object" }),
        JSON.parse('{"__proto__":{"polluted":true}}'),
      ),
    ).toThrow(/Unsafe/);
  });
  it.each([
    { foo: 1 },
    { content: null },
    { content: [], isError: "true" },
    { content: [{ type: "text", text: 123 }] },
    { content: [], structuredContent: [] },
  ])("refuses malformed outcome %j", (value) => {
    expect(() => parseToolResult(value)).toThrow(/unconfirmed/);
  });
  it("preserves valid error/result bodies without treating links as requests", () => {
    expect(
      parseToolResult({ content: [{ type: "text", text: "Server refused" }], isError: true }),
    ).toEqual({ text: "Server refused", isError: true });
    expect(parseToolResult({ content: [], structuredContent: { updated: true } })).toEqual({
      text: "",
      structuredContent: { updated: true },
      isError: false,
    });
    expect(
      parseToolResult({
        content: [{ type: "resource_link", name: "Report", uri: "http://127.0.0.1/private" }],
      }).text,
    ).not.toContain("127.0.0.1");
  });
  it("does not retry an actual MCP call after a malformed result", async () => {
    const methods: string[] = [];
    const post: PostRequest = vi.fn(async (_url, body) => {
      const rpc = JSON.parse(body);
      methods.push(rpc.method);
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result:
            rpc.method === "initialize" ? { protocolVersion: "2025-06-18" } : { malformed: true },
        }),
      };
    });
    const client = new McpClient("https://tools.example.test/mcp", async () => "credential", post);
    await expect(client.call("update", { name: "item" })).rejects.toThrow(/unconfirmed/);
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/call"]);
  });
  it("does not accept a contradictory JSON-RPC success and error envelope", async () => {
    let calls = 0;
    const post: PostRequest = vi.fn(async (_url, body) => {
      const rpc = JSON.parse(body);
      if (rpc.method === "tools/call") calls++;
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpc.id,
          result:
            rpc.method === "initialize"
              ? { protocolVersion: "2025-06-18" }
              : { content: [{ type: "text", text: "Success" }] },
          ...(rpc.method === "tools/call" ? { error: { code: -32603, message: "Failed" } } : {}),
        }),
      };
    });
    const client = new McpClient("https://tools.example.test/mcp", async () => "credential", post);
    await expect(client.call("update", {})).rejects.toThrow(/unconfirmed/);
    expect(calls).toBe(1);
  });
});
