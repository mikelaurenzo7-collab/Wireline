import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { protectAuthResponseFromCaching } from "../src/middleware/auth-response-cache";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("authentication response cache boundary", () => {
  it("marks every authentication response private and uncacheable", () => {
    const headers = new Map<string, string>();
    const varied: string[] = [];
    const response = {
      set(name: string, value: string) {
        headers.set(name, value);
        return response;
      },
      vary(name: string) {
        varied.push(name);
        return response;
      },
    } as unknown as Response;
    const next = vi.fn();

    protectAuthResponseFromCaching({} as Request, response, next);

    expect(headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(headers.get("Pragma")).toBe("no-cache");
    expect(varied).toEqual(["Cookie", "Authorization"]);
    expect(next).toHaveBeenCalledOnce();
  });

  it("mounts once before every authentication router", () => {
    const registry = read("src/server/register-api-routes.ts");
    const boundaryIndex = registry.indexOf('app.use("/api/auth", protectAuthResponseFromCaching)');
    expect(boundaryIndex).toBeGreaterThan(-1);
    for (const router of [
      "authOAuthExchangeAtomicRouter",
      "authOAuthBrowserBindingRouter",
      "authOAuthRouter",
      "authSessionHardeningRouter",
      "authRouter",
    ]) {
      expect(registry.indexOf(`app.use(${router})`), router).toBeGreaterThan(boundaryIndex);
    }
  });

  it("does not let OAuth-specific hardening weaken the centralized private policy", () => {
    for (const path of [
      "src/routes/auth-oauth-exchange-atomic-routes.ts",
      "src/routes/auth-oauth-browser-binding.ts",
      "src/routes/auth-oauth-routes.ts",
    ]) {
      const source = read(path);
      expect(source, path).not.toContain('"Cache-Control", "no-store, max-age=0"');
      expect(source, path).toContain('"Cache-Control", "private, no-store, max-age=0"');
    }
  });
});
