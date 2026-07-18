import { gatewayAuthorizationHeaders, isGatewayCredentialAvailable } from "./ai-gateway-auth";
import { log } from "./server-logger";

const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
const CATALOG_TTL_MS = 5 * 60 * 1000;

export type GatewayModelEntry = {
  id: string;
  name: string;
  provider: string;
  modelType: string;
  description?: string;
};

type GatewayCatalogResponse = {
  data?: unknown[];
  models?: unknown[];
};

let catalogCache: { expiresAt: number; models: GatewayModelEntry[] } | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeModel(raw: unknown): GatewayModelEntry | null {
  const value = asRecord(raw);
  if (!value) return null;
  const id = stringValue(value.id) || stringValue(value.model);
  if (!id || id.length > 200 || /\s|\.\./.test(id)) return null;
  const modelType = stringValue(value.modelType) || stringValue(value.type) || "language";
  const provider = stringValue(value.provider) || id.split("/")[0] || "gateway";
  const name = stringValue(value.name) || stringValue(value.displayName) || id;
  const description = stringValue(value.description) || undefined;
  return { id, name, provider, modelType, description };
}

export function isAIGatewayConfigured() {
  return isGatewayCredentialAvailable();
}

export function gatewayModelId(model: string) {
  const selected = model.trim();
  if (!selected) return process.env.WIRELINE_GATEWAY_STRUCTURED_MODEL?.trim() || "xai/grok-4.5";
  if (selected.includes("/")) return selected;
  if (/grok/i.test(selected)) return `xai/${selected}`;
  if (/^gpt-/i.test(selected)) return `openai/${selected}`;
  if (/^gemini/i.test(selected)) return `google/${selected}`;
  return selected;
}

export function gatewayHeaders(): Record<string, string> {
  return gatewayAuthorizationHeaders();
}

export async function listAIGatewayLanguageModels(): Promise<GatewayModelEntry[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;

  try {
    const response = await fetch(`${AI_GATEWAY_BASE_URL}/models`, {
      headers: isAIGatewayConfigured() ? gatewayHeaders() : undefined,
    });
    if (!response.ok) throw new Error(`AI Gateway model catalog failed (${response.status})`);
    const body = (await response.json()) as GatewayCatalogResponse;
    const source = Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.models)
        ? body.models
        : [];
    const models = source
      .map(normalizeModel)
      .filter((model): model is GatewayModelEntry => !!model)
      .filter((model) => model.modelType.toLowerCase() === "language")
      .sort((left, right) => left.name.localeCompare(right.name));

    catalogCache = { expiresAt: Date.now() + CATALOG_TTL_MS, models };
    return models;
  } catch (error) {
    log.warn("AI Gateway model catalog unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
    return catalogCache?.models ?? [];
  }
}

export async function isAIGatewayLanguageModel(modelId: string) {
  const normalized = gatewayModelId(modelId);
  const models = await listAIGatewayLanguageModels();
  return models.some((model) => model.id === normalized);
}

export { AI_GATEWAY_BASE_URL };
