import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

// Exact-PR-head release gate: session routes must remain generation-aware and precede legacy handlers.
describe("authentication route ownership", () => {
  it("mounts revocation-aware session handlers before the legacy auth router", () => {
    const registry = read("src/server/register-api-routes.ts");
    const hardened = registry.indexOf("app.use(authSessionHardeningRouter)");
    const legacy = registry.indexOf("app.use(authRouter)");

    expect(hardened).toBeGreaterThan(-1);
    expect(legacy).toBeGreaterThan(hardened);
  });

  it("keeps all rotating and migrated sessions bound to database session generations", () => {
    const hardened = read("src/routes/auth-session-hardening-routes.ts");
    const authService = read("src/lib/auth-service.ts");

    expect(hardened).toContain('"/api/auth/refresh"');
    expect(hardened).toContain('"/api/auth/migrate-session"');
    expect(hardened).toContain('router.post("/api/auth/signout"');
    expect(hardened).toContain("sessionVersion: user.sessionVersion");
    expect(hardened).toContain("sessionVersion: sql`${sessionUsers.sessionVersion} + 1`");
    expect(authService).toContain('throw new Error("SESSION_VERSION_REQUIRED")');
  });
});
