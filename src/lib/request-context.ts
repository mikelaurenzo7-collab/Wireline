/**
 * Per-request correlation context (Node / API only).
 * Populated by server.ts middleware; read by structured logs when callers
 * omit an explicit requestId field.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
};

export const requestContextStore = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContextStore.getStore()?.requestId;
}

export function runWithRequestContext<T>(requestId: string, fn: () => T): T {
  return requestContextStore.run({ requestId }, fn);
}
