/**
 * Thin HTTP client for the Google Stitch MCP endpoint.
 * Uses API key auth (X-Goog-Api-Key) — no SDK required.
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
      const match = nameRaw.match(/projects\/(\d+)\/screens\/(\d+)/);
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
    if (screenId && /^\d+$/.test(screenId) && !seen.has(screenId)) {
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
        if (/^\d+$/.test(projectId)) break;
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
        if (/^\d+$/.test(id)) return id;
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
