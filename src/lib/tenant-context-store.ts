import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped tenant identity for database isolation. Provider attribution
 * uses its own leaf context so background work cannot affect RLS behavior.
 */
export const tenantStore = new AsyncLocalStorage<string>();
