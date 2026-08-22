import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped tenant identity shared by database isolation and provider
 * safety attribution without making transport clients import database setup.
 */
export const tenantStore = new AsyncLocalStorage<string>();
