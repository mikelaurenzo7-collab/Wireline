/**
 * Stitch response parsers and legacy HTTP MCP client.
 * Production Director flows use @google/stitch-sdk via google-stitch-sdk-client.ts.
 */
import {
  getGoogleStitchApiKey,
  getGoogleStitchMcpBaseUrl,
  getGoogleStitchTimeoutMs,
} from "./google-stitch-config";
import { log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export class GoogleStitchError extends Error {
  readonly code: string;
  readonly recoverable: boolean;

  constructor(message: string, code = "UNKNOWN_ERROR", recoverable = false) {
    super(message);
    this.name = "GoogleStitchError";
    this.code = code;
    this.recoverable = recoverable;
  }
}

type McpContentBlock = { type?: string; text?: string };

function parseNestedJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function unwrapStitchToolPayload(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const envelope = result as {
    isError?: boolean;
    content?: McpContentBlock[];
    structuredContent?: unknown;
  };
  if (envelope.isError) {
    const msg =
      envelope.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join("\n") || "Stitch tool failed";
    throw new GoogleStitchError(msg, "TOOL_ERROR");
  }
  if (envelope.structuredContent !== undefined) return envelope.structuredContent;
  const text = envelope.content?.find((c) => c.type === "text" && c.text)?.text;
  if (text) return parseNestedJson(text);
  return result;
}

export function extractStitchScreens(payload: unknown): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const o = node as Record<string, unknown>;
    let screenId = "";
    let projectId = "";
    const nameRaw = o.name;
    if (typeof nameRaw === "string") {
      const match = nameRaw.match(/projects\/([^/]+)\/screens\/([^/]+)/);
      if (match) {
        projectId = match[1]!;
        screenId = match[2]!;
      }
    }
    if (!screenId) {
      screenId = String(o.screenId ?? o.id ?? "")
        .replace(/^screens\//, "")
        .trim();
    }
    if (!projectId) {
      projectId = String(o.projectId ?? "")
        .replace(/^projects\//, "")
        .trim();
    }
    if (screenId && /^[a-zA-Z0-9_-]+$/.test(screenId) && !seen.has(screenId)) {
      seen.add(screenId);
      found.push({ ...o, screenId, projectId: projectId || undefined });
    }
    for (const value of Object.values(o)) visit(value);
  };

  visit(payload);
  return found;
}

export interface StitchProjectRef {
  projectId: string;
  title?: string;
  projectType?: string;
}

export function extractStitchProjects(payload: unknown): StitchProjectRef[] {
  const found: StitchProjectRef[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const o = node as Record<string, unknown>;
    let projectId = "";
    for (const key of ["projectId", "id", "name"]) {
      const raw = o[key];
      if (typeof raw === "string") {
        projectId = raw.replace(/^projects\//, "").trim();
        if (/^[a-zA-Z0-9_-]+$/.test(projectId)) break;
        projectId = "";
      }
    }
    if (projectId && !seen.has(projectId)) {
      seen.add(projectId);
      const projectType = [o.projectType, o.type, o.project_type]
        .map((v) => (typeof v === "string" ? v : ""))
        .find(Boolean);
      const title = [o.title, o.displayName, o.display_name]
        .map((v) => (typeof v === "string" ? v : ""))
        .find(Boolean);
      found.push({
        projectId,
        title: title || undefined,
        projectType: projectType || undefined,
      });
    }
    for (const value of Object.values(o)) visit(value);
  };

  visit(payload);
  return found;
}

/** Prefer TEXT_TO_UI_PRO projects — MCP create_project yields PROJECT_DESIGN (no generation). */
export function pickCompatibleStitchProject(projects: StitchProjectRef[]): StitchProjectRef | null {
  if (projects.length === 0) return null;
  const textToUi = projects.filter((p) => /TEXT_TO_UI/i.test(p.projectType ?? ""));
  if (textToUi.length > 0) return textToUi[0]!;
  return projects[0]!;
}

/** HTML returned inline from get_screen_code / fetch_screen_code. */
export function extractStitchInlineHtml(payload: unknown): Buffer | undefined {
  const visitText = (node: unknown): string | undefined => {
    if (typeof node !== "string") return undefined;
    const trimmed = node.trim();
    if (trimmed.startsWith("<!") || trimmed.startsWith("<html") || trimmed.includes("<body")) {
      return trimmed;
    }
    return undefined;
  };

  const visit = (node: unknown): string | undefined => {
    const direct = visitText(node);
    if (direct) return direct;
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return undefined;
    }
    const o = node as Record<string, unknown>;
    for (const key of ["html", "htmlCode", "code", "content", "source"]) {
      const value = o[key];
      if (typeof value === "string") {
        const hit = visitText(value);
        if (hit) return hit;
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const block = value as { content?: string; html?: string };
        if (typeof block.content === "string") {
          const hit = visitText(block.content);
          if (hit) return hit;
        }
        if (typeof block.html === "string") {
          const hit = visitText(block.html);
          if (hit) return hit;
        }
      }
    }
    for (const value of Object.values(o)) {
      const hit = visit(value);
      if (hit) return hit;
    }
    return undefined;
  };

  const html = visit(payload);
  return html ? Buffer.from(html, "utf8") : undefined;
}

/** PNG bytes inline (base64) from get_screen_image / fetch_screen_image. */
/** Stitch often returns a tiny grid placeholder PNG before HTML/screenshot packaging finishes. */
export const STITCH_PLACEHOLDER_IMAGE_MAX_BYTES = 25_000;

export function isLikelyStitchPlaceholderImage(buf: Buffer): boolean {
  return buf.byteLength <= STITCH_PLACEHOLDER_IMAGE_MAX_BYTES;
}

/** HTML is authoritative; image-only counts on the final poll when it is not a grid placeholder. */
export function stitchScreenAssetsReady(
  assets: { html?: Buffer; image?: Buffer },
  options: { allowImageFallback?: boolean } = {},
): boolean {
  if (assets.html && assets.html.byteLength > 50) return true;
  if (
    options.allowImageFallback &&
    assets.image &&
    assets.image.byteLength > 0 &&
    !isLikelyStitchPlaceholderImage(assets.image)
  ) {
    return true;
  }
  return false;
}

export function extractStitchInlineImage(payload: unknown): Buffer | undefined {
  const fromBase64 = (raw: string): Buffer | undefined => {
    const clean = raw.replace(/^data:image\/[a-z+]+;base64,/i, "").trim();
    if (clean.length < 128) return undefined;
    try {
      return Buffer.from(clean, "base64");
    } catch {
      return undefined;
    }
  };

  const visit = (node: unknown): Buffer | undefined => {
    if (typeof node === "string") return fromBase64(node);
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return undefined;
    }
    const o = node as Record<string, unknown>;
    for (const key of ["image", "screenshot", "png", "data", "content", "base64"]) {
      const value = o[key];
      if (typeof value === "string") {
        const hit = fromBase64(value);
        if (hit) return hit;
      }
    }
    for (const value of Object.values(o)) {
      const hit = visit(value);
      if (hit) return hit;
    }
    return undefined;
  };

  return visit(payload);
}

/** Merge get_screen payloads into a screen record (flat or nested). */
export function mergeStitchScreenRecord(
  target: Record<string, unknown>,
  payload: unknown,
): Record<string, unknown> {
  const screens = extractStitchScreens(payload);
  if (screens[0]) return { ...target, ...screens[0] };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return target;
  const o = payload as Record<string, unknown>;
  if (o.htmlCode || o.screenshot) return { ...target, ...o };
  for (const key of ["result", "screen", "data"]) {
    const inner = o[key];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      const record = inner as Record<string, unknown>;
      if (record.htmlCode || record.screenshot || record.screenId) {
        return { ...target, ...record };
      }
    }
  }
  return target;
}

export function extractStitchProjectId(payload: unknown): string | null {
  const visit = (node: unknown): string | null => {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const hit = visit(item);
        if (hit) return hit;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    for (const key of ["projectId", "id", "name"]) {
      const raw = o[key];
      if (typeof raw === "string") {
        const id = raw.replace(/^projects\//, "").trim();
        if (/^[a-zA-Z0-9_-]+$/.test(id)) return id;
      }
    }
    for (const value of Object.values(o)) {
      const hit = visit(value);
      if (hit) return hit;
    }
    return null;
  };
  return visit(payload);
}

export class GoogleStitchMcpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private rpcId = 0;

  constructor(options?: { apiKey?: string; baseUrl?: string; timeoutMs?: number }) {
    const apiKey = options?.apiKey ?? getGoogleStitchApiKey();
    if (!apiKey)
      throw new GoogleStitchError("GOOGLE_STITCH_API_KEY is not configured", "AUTH_FAILED");
    this.apiKey = apiKey;
    this.baseUrl = options?.baseUrl ?? getGoogleStitchMcpBaseUrl();
    this.timeoutMs = options?.timeoutMs ?? getGoogleStitchTimeoutMs();
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<T> {
    const controller = new AbortController();
    const budget = timeoutMs ?? this.timeoutMs;
    const timeout = setTimeout(() => controller.abort(), budget);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const body = {
        jsonrpc: "2.0",
        id: ++this.rpcId,
        method: "tools/call",
        params: { name, arguments: args },
      };
      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new GoogleStitchError(
          `Stitch MCP HTTP ${res.status}: ${text.slice(0, 300)}`,
          res.status === 429 ? "RATE_LIMITED" : "NETWORK_ERROR",
          res.status === 429,
        );
      }
      let json: unknown;
      try {
        json = JSON.parse(text) as unknown;
      } catch {
        throw new GoogleStitchError("Stitch MCP returned non-JSON", "NETWORK_ERROR");
      }
      const envelope = json as { error?: { message?: string }; result?: unknown };
      if (envelope.error) {
        throw new GoogleStitchError(envelope.error.message || "Stitch MCP error", "TOOL_ERROR");
      }
      return unwrapStitchToolPayload(envelope.result) as T;
    } catch (e) {
      if (e instanceof GoogleStitchError) throw e;
      if (controller.signal.aborted) {
        throw new GoogleStitchError(
          "Stitch request timed out or was aborted",
          "NETWORK_ERROR",
          true,
        );
      }
      log.warn("stitch mcp call failed", { tool: name, error: getErrorMessage(e) });
      throw new GoogleStitchError(getErrorMessage(e), "NETWORK_ERROR", true);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
