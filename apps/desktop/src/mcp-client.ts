import { assertBoundedToolJson } from "../../../src/lib/computer-tool-json";
import { createHash, randomUUID } from "node:crypto";
import Ajv from "ajv";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  isEventStreamContentType,
  parseCompleteSseData,
  postPinned,
  validateEndpoint,
  type PostRequest,
} from "./transport";
import type { ToolDescription } from "./contracts";

const PROTOCOLS = new Set(["2025-06-18", "2025-03-26"]);
const validatorOptions = {
  strict: false,
  allErrors: false,
  validateFormats: true,
  addUsedSchema: false,
};
const draft7 = new Ajv(validatorOptions);
const draft2020 = new Ajv2020(validatorOptions);
addFormats(draft7);
addFormats(draft2020);
export type ToolResult = { text: string; structuredContent?: unknown; isError: boolean };

export function catalogDigest(tools: ToolDescription[]): string {
  return createHash("sha256").update(JSON.stringify(tools)).digest("hex");
}

/** External schemas remain data. No network refs, coercion, defaults, or removal of arguments. */
export function validateToolArguments(tool: ToolDescription, args: Record<string, unknown>): void {
  assertBoundedToolJson(tool.inputSchema, true);
  assertBoundedToolJson(args);
  const dialect = tool.inputSchema.$schema;
  const validator =
    dialect === undefined ||
    dialect === "https://json-schema.org/draft/2020-12/schema" ||
    dialect === "https://json-schema.org/draft/2020-12/schema#"
      ? draft2020
      : typeof dialect === "string" &&
          /^https?:\/\/json-schema\.org\/draft-07\/schema#?$/.test(dialect)
        ? draft7
        : null;
  if (!validator) throw new Error("This tool uses an unsupported JSON Schema dialect.");
  const valid = validator.compile(
    validator === draft7
      ? { ...tool.inputSchema, $schema: "http://json-schema.org/draft-07/schema#" }
      : tool.inputSchema,
  );
  if (!valid(args)) throw new Error("The proposed arguments do not match this tool's schema.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** A malformed response is an unknown outcome, never evidence that a write worked. */
export function parseToolResult(result: Record<string, unknown>): ToolResult {
  const invalid = () =>
    new Error(
      "The tool returned a malformed result. Its outcome is unconfirmed; the request was not retried.",
    );
  if (result.isError !== undefined && typeof result.isError !== "boolean") throw invalid();
  if (!Array.isArray(result.content)) throw invalid();
  if (result.structuredContent !== undefined && !isRecord(result.structuredContent))
    throw invalid();
  const texts: string[] = [];
  for (const part of result.content) {
    if (!isRecord(part)) throw invalid();
    if (part.type === "text") {
      if (typeof part.text !== "string") throw invalid();
      texts.push(part.text);
    } else if (part.type === "image" || part.type === "audio") {
      if (typeof part.data !== "string" || typeof part.mimeType !== "string") throw invalid();
      texts.push(`[${part.type} returned; inspect it in the connected service.]`);
    } else if (part.type === "resource_link") {
      if (typeof part.uri !== "string" || typeof part.name !== "string") throw invalid();
      // Never fetch or open provider-supplied resource URLs automatically.
      texts.push(`Resource available in the connected service: ${part.name.slice(0, 200)}`);
    } else if (part.type === "resource") {
      if (
        !isRecord(part.resource) ||
        typeof part.resource.uri !== "string" ||
        (typeof part.resource.text !== "string" && typeof part.resource.blob !== "string")
      )
        throw invalid();
      if (typeof part.resource.text === "string") texts.push(part.resource.text);
      else texts.push("[Binary resource returned; inspect it in the connected service.]");
    } else throw invalid();
  }
  return {
    text: texts.join("\n").slice(0, 20_000),
    ...(result.structuredContent !== undefined
      ? { structuredContent: result.structuredContent }
      : {}),
    isError: result.isError === true,
  };
}

function parseRpc(body: string, contentType: string, id: string): Record<string, unknown> {
  const messages: unknown[] = isEventStreamContentType(contentType)
    ? parseCompleteSseData(body)
        .filter(Boolean)
        .map((data) => JSON.parse(data))
    : [JSON.parse(body)];
  const matches = messages.filter((item): item is Record<string, unknown> =>
    Boolean(
      item &&
      typeof item === "object" &&
      (item as Record<string, unknown>).id === id &&
      (item as Record<string, unknown>).jsonrpc === "2.0",
    ),
  );
  if (matches.length !== 1) throw new Error("The tool server returned an unrecognized response.");
  if (Object.hasOwn(matches[0], "error")) {
    if (
      Object.hasOwn(matches[0], "result") ||
      !isRecord(matches[0].error) ||
      !Number.isSafeInteger(matches[0].error.code) ||
      typeof matches[0].error.message !== "string"
    )
      throw new Error(
        "The tool server returned a malformed response. Its outcome is unconfirmed; the request was not retried.",
      );
    throw new Error("The tool server refused the request. Check its connection or permissions.");
  }
  const result = matches[0].result;
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("The tool server returned an invalid result.");
  return result as Record<string, unknown>;
}

/** Streamable HTTP, explicitly negotiated. Mutating calls are always single attempt. */
export class McpClient {
  private version = "2025-06-18";
  private session = "";
  private initialized = false;
  constructor(
    private readonly url: string,
    private readonly token: () => Promise<string>,
    private readonly post: PostRequest = postPinned,
  ) {
    validateEndpoint(url);
  }
  private async request(
    method: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const id = randomUUID();
    const bearer = await this.token();
    const reply = await this.post(
      this.url,
      JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": this.version,
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      signal,
    );
    // An expired session needs a new explicit initialization. Never replay this
    // request: a write's remote outcome may still be unknown to the companion.
    if (reply.status === 404) {
      this.initialized = false;
      this.session = "";
    }
    if (reply.status < 200 || reply.status >= 300)
      throw new Error(
        reply.status === 401 || reply.status === 403
          ? "This connection needs authorization. Reconnect before trying again."
          : `The tool server returned HTTP ${reply.status}. The request was not retried.`,
      );
    const session = reply.headers["mcp-session-id"];
    if (session) {
      if (session.length > 256 || !/^[\x21-\x7E]+$/.test(session))
        throw new Error("Invalid MCP session identifier.");
      this.session = session;
    }
    return parseRpc(reply.body, reply.headers["content-type"] || "", id);
  }
  async initialize(signal?: AbortSignal): Promise<void> {
    if (this.initialized) return;
    const result = await this.request(
      "initialize",
      {
        protocolVersion: this.version,
        capabilities: {},
        clientInfo: { name: "botbound-desktop", version: "0.1.0" },
      },
      signal,
    );
    if (typeof result.protocolVersion !== "string" || !PROTOCOLS.has(result.protocolVersion))
      throw new Error("This MCP server does not support a compatible Streamable HTTP version.");
    this.version = result.protocolVersion;
    const bearer = await this.token();
    const reply = await this.post(
      this.url,
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": this.version,
        ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      },
      signal,
    );
    if (reply.status < 200 || reply.status >= 300)
      throw new Error("The tool connection could not initialize.");
    this.initialized = true;
  }
  async tools(signal?: AbortSignal): Promise<ToolDescription[]> {
    await this.initialize(signal);
    const collected: ToolDescription[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const result = await this.request("tools/list", cursor ? { cursor } : {}, signal);
      if (!Array.isArray(result.tools))
        throw new Error("The server returned an invalid tool catalog.");
      for (const value of result.tools) {
        if (!value || typeof value !== "object") throw new Error("Invalid tool description.");
        const item = value as Record<string, unknown>;
        if (
          typeof item.name !== "string" ||
          !/^[A-Za-z0-9_.:/-]{1,128}$/.test(item.name) ||
          !item.inputSchema ||
          typeof item.inputSchema !== "object" ||
          Array.isArray(item.inputSchema) ||
          (item.inputSchema as Record<string, unknown>).type !== "object"
        )
          throw new Error("The server returned an unsupported tool schema.");
        if (collected.some((tool) => tool.name === item.name))
          throw new Error("The server repeated a tool name.");
        const tool = {
          name: item.name,
          description: String(item.description || "").slice(0, 2000),
          inputSchema: item.inputSchema as Record<string, unknown>,
        };
        // Compile now to detect unsupported refs/unsafe schemas; required arguments may reject {}.
        try {
          validateToolArguments(tool, {});
        } catch (error) {
          if (
            !(error instanceof Error) ||
            error.message !== "The proposed arguments do not match this tool's schema."
          )
            throw error;
        }
        collected.push(tool);
        if (collected.length > 128 || JSON.stringify(collected).length > 256_000)
          throw new Error("This tool catalog is too large. Use a server with a narrower tool set.");
      }
      cursor = typeof result.nextCursor === "string" ? result.nextCursor : undefined;
      if (cursor && (cursor.length > 1024 || cursors.has(cursor)))
        throw new Error("The server repeated its catalog cursor.");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return collected.sort((a, b) => a.name.localeCompare(b.name));
  }
  async call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    await this.initialize(signal);
    const result = await this.request("tools/call", { name, arguments: args }, signal);
    return parseToolResult(result);
  }
}
