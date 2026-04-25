import type { ZodTypeAny, infer as zInfer } from "zod";

import { supabase } from "./supabase";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, message: string, options: { code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options.code;
    this.details = options.details;
  }
}

export async function authFetch(url: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(url, { ...options, headers });
}

interface ApiRequestInit<TBody extends ZodTypeAny | undefined> extends Omit<RequestInit, "body"> {
  body?: TBody extends ZodTypeAny ? zInfer<TBody> : unknown;
  /** Validates the request body against this schema before sending. */
  bodySchema?: TBody;
}

/**
 * Typed JSON wrapper around `authFetch`. Returns parsed JSON or throws an
 * `ApiError`. Optionally validates the request body against a Zod schema so
 * the frontend can't silently send the wrong shape.
 */
export async function apiRequest<
  TBody extends ZodTypeAny | undefined = undefined,
  TResponse = unknown,
>(url: string, init: ApiRequestInit<TBody> = {}): Promise<TResponse> {
  const { body, bodySchema, headers, ...rest } = init;

  let serializedBody: BodyInit | undefined;
  if (body !== undefined) {
    const validatedBody = bodySchema ? bodySchema.parse(body) : body;
    serializedBody = JSON.stringify(validatedBody);
  }

  const response = await authFetch(url, {
    ...rest,
    headers: {
      ...(serializedBody ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: serializedBody,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    const errorPayload = (parsed as { error?: string; code?: string; details?: unknown }) || {};
    throw new ApiError(
      response.status,
      errorPayload.error || `Request failed with status ${response.status}`,
      { code: errorPayload.code, details: errorPayload.details }
    );
  }

  return parsed as TResponse;
}

export const apiClient = {
  get: <TResponse = unknown>(url: string, init?: ApiRequestInit<undefined>) =>
    apiRequest<undefined, TResponse>(url, { ...init, method: "GET" }),
  post: <TBody extends ZodTypeAny | undefined = undefined, TResponse = unknown>(
    url: string,
    init?: ApiRequestInit<TBody>
  ) => apiRequest<TBody, TResponse>(url, { ...init, method: "POST" }),
  put: <TBody extends ZodTypeAny | undefined = undefined, TResponse = unknown>(
    url: string,
    init?: ApiRequestInit<TBody>
  ) => apiRequest<TBody, TResponse>(url, { ...init, method: "PUT" }),
  patch: <TBody extends ZodTypeAny | undefined = undefined, TResponse = unknown>(
    url: string,
    init?: ApiRequestInit<TBody>
  ) => apiRequest<TBody, TResponse>(url, { ...init, method: "PATCH" }),
  delete: <TResponse = unknown>(url: string, init?: ApiRequestInit<undefined>) =>
    apiRequest<undefined, TResponse>(url, { ...init, method: "DELETE" }),
};

